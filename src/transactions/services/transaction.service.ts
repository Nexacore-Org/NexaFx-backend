/* eslint-disable @typescript-eslint/require-await */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Operation,
  Asset,
  Transaction as StellarTransaction,
} from 'stellar-sdk';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import {
  CreateDepositDto,
  CreateWithdrawalDto,
  TransactionQueryDto,
} from '../dtos/transaction.dto';
import { CurrenciesService } from '../../currencies/currencies.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../blockchain/stellar/stellar.service';
import { UsersService } from '../../users/users.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';
import { UserRole } from '../../users/user.entity';
import { ConfigService } from '@nestjs/config';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Narrows an unknown catch value to a plain Error with a message string. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** Type guard for the Stellar submit result shape we depend on. */
interface StellarSubmitResult {
  hash: string;
}

function isStellarSubmitResult(value: unknown): value is StellarSubmitResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hash' in value &&
    typeof (value as Record<string, unknown>).hash === 'string'
  );
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly currenciesService: CurrenciesService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly stellarService: StellarService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a deposit transaction
   */
  async createDeposit(
    userId: string,
    createDepositDto: CreateDepositDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const { amount, currency, sourceAddress } = createDepositDto;

    this.logger.log(
      `Creating deposit for user ${userId}: ${amount} ${currency}`,
    );

    const currencyData = await this.currenciesService.findOne(currency);
    if (!currencyData || !currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    let rate: string;
    try {
      const exchangeRate = await this.exchangeRatesService.getRate(
        currency,
        'USD',
      );
      rate = exchangeRate.rate.toString();
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to get exchange rate for ${currency}`, error);
      throw new BadRequestException(
        `Unable to get exchange rate for ${currency}`,
      );
    }

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount: amount.toString(),
      currency,
      rate,
      status: TransactionStatus.PENDING,
    });

    await this.transactionRepository.save(transaction);

    try {
      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.DEPOSIT_CREATED,
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          sourceAddress,
          ip: ipAddress,
          device: userAgent,
        },
      );

      const destinationAddress = await this.getUserStellarAddress(userId);

      const paymentOperation = Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount.toString(),
      });

      const stellarTx = await this.stellarService.createTransaction({
        sourcePublicKey: sourceAddress,
        operations: [paymentOperation],
        memo: `DEPOSIT-${transaction.id}`,
      });

      const secretKey = await this.getStellarSecretKey();

      // Typed as StellarTransaction — no `any` cast needed
      const signedTx: StellarTransaction =
        await this.stellarService.signTransaction(stellarTx, secretKey);

      const rawResult: unknown =
        await this.stellarService.submitTransaction(signedTx);

      if (!isStellarSubmitResult(rawResult)) {
        throw new Error('Unexpected response shape from Stellar submit');
      }

      transaction.txHash = rawResult.hash;
      await this.transactionRepository.save(transaction);

      this.logger.log(
        `Deposit transaction created successfully: ${transaction.id}`,
      );

      return transaction;
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to create deposit transaction`, error);

      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);

      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.DEPOSIT_CREATED + '_FAILED',
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          reason: error.message,
          ip: ipAddress,
          device: userAgent,
        },
      );

      throw new InternalServerErrorException(
        'Failed to create deposit transaction on blockchain',
      );
    }
  }

  /**
   * Create a withdrawal transaction
   */
  async createWithdrawal(
    userId: string,
    createWithdrawalDto: CreateWithdrawalDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const { amount, currency, destinationAddress } = createWithdrawalDto;

    this.logger.log(
      `Creating withdrawal for user ${userId}: ${amount} ${currency}`,
    );

    const currencyData = await this.currenciesService.findOne(currency);
    if (!currencyData || !currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userBalance = await this.getUserBalance(userId, currency);
    if (parseFloat(userBalance) < amount) {
      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.WITHDRAWAL_CREATED + '_FAILED',
        undefined,
        {
          amount,
          currency,
          reason: 'Insufficient balance',
          ip: ipAddress,
          device: userAgent,
        },
      );

      throw new BadRequestException('Insufficient balance');
    }

    let rate: string;
    try {
      const exchangeRate = await this.exchangeRatesService.getRate(
        currency,
        'USD',
      );
      rate = exchangeRate.rate.toString();
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to get exchange rate for ${currency}`, error);
      throw new BadRequestException(
        `Unable to get exchange rate for ${currency}`,
      );
    }

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.WITHDRAW,
      amount: amount.toString(),
      currency,
      rate,
      status: TransactionStatus.PENDING,
    });

    await this.transactionRepository.save(transaction);

    try {
      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.WITHDRAWAL_CREATED,
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          destinationAddress,
          ip: ipAddress,
          device: userAgent,
        },
      );

      const sourceAddress = await this.getUserStellarAddress(userId);

      const paymentOperation = Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount.toString(),
      });

      const stellarTx = await this.stellarService.createTransaction({
        sourcePublicKey: sourceAddress,
        operations: [paymentOperation],
        memo: `WITHDRAW-${transaction.id}`,
      });

      const secretKey = await this.getUserStellarSecretKey(userId);

      const signedTx: StellarTransaction =
        await this.stellarService.signTransaction(stellarTx, secretKey);

      const rawResult: unknown =
        await this.stellarService.submitTransaction(signedTx);

      if (!isStellarSubmitResult(rawResult)) {
        throw new Error('Unexpected response shape from Stellar submit');
      }

      transaction.txHash = rawResult.hash;
      await this.transactionRepository.save(transaction);

      await this.updateUserBalance(userId, currency, -amount);

      this.logger.log(
        `Withdrawal transaction created successfully: ${transaction.id}`,
      );

      return transaction;
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to create withdrawal transaction`, error);

      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);

      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.WITHDRAWAL_CREATED + '_FAILED',
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          reason: error.message,
          ip: ipAddress,
          device: userAgent,
        },
      );

      throw new InternalServerErrorException(
        'Failed to create withdrawal transaction on blockchain',
      );
    }
  }

  /**
   * Verify transaction status on the blockchain
   */
  async verifyTransaction(
    transactionId: string,
    requestingUserId: string,
    requestingUserRole: UserRole,
    adminId?: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (!transaction.txHash) {
      throw new BadRequestException(
        'Transaction does not have a blockchain hash yet',
      );
    }

    const isAdmin = requestingUserRole === UserRole.ADMIN;
    if (!isAdmin && transaction.userId !== requestingUserId) {
      throw new ForbiddenException(
        'You do not have permission to verify this transaction',
      );
    }

    if (!isAdmin && transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Transaction is already ${transaction.status.toLowerCase()} and cannot be re-verified`,
      );
    }

    this.logger.log(`Verifying transaction: ${transactionId}`);

    try {
      const verificationResult = await this.stellarService.verifyTransaction(
        transaction.txHash,
      );

      const oldStatus = transaction.status;

      if (verificationResult.status === 'SUCCESS') {
        transaction.status = TransactionStatus.SUCCESS;

        if (transaction.type === TransactionType.DEPOSIT) {
          await this.updateUserBalance(
            transaction.userId,
            transaction.currency,
            parseFloat(transaction.amount),
          );
        }

        this.logger.log(`Transaction verified successfully: ${transactionId}`);
      } else if (verificationResult.status === 'FAILED') {
        transaction.status = TransactionStatus.FAILED;
        transaction.failureReason =
          'Transaction verification failed on blockchain';

        if (transaction.type === TransactionType.WITHDRAW) {
          await this.updateUserBalance(
            transaction.userId,
            transaction.currency,
            parseFloat(transaction.amount),
          );
        }

        this.logger.warn(`Transaction verification failed: ${transactionId}`);
      } else {
        this.logger.log(`Transaction still pending: ${transactionId}`);
        return transaction;
      }

      await this.transactionRepository.save(transaction);

      await this.auditLogsService.logTransactionEvent(
        transaction.userId,
        AuditAction.TRANSACTION_STATUS_UPDATED,
        transaction.id,
        {
          oldStatus,
          newStatus: transaction.status,
          verifiedBy: adminId,
          verificationResult: verificationResult.status,
          failureReason: transaction.failureReason,
        },
      );

      return transaction;
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to verify transaction`, error);
      throw new InternalServerErrorException(
        'Failed to verify transaction on blockchain',
      );
    }
  }

  /**
   * Update transaction status manually (admin function)
   */
  async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    adminId: string,
    reason?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const oldStatus = transaction.status;
    transaction.status = status;

    if (reason) {
      transaction.failureReason = reason;
    }

    await this.transactionRepository.save(transaction);

    await this.auditLogsService.logTransactionEvent(
      transaction.userId,
      AuditAction.TRANSACTION_STATUS_UPDATED,
      transaction.id,
      {
        oldStatus,
        newStatus: status,
        updatedBy: adminId,
        reason,
        ip: ipAddress,
        device: userAgent,
      },
    );

    this.logger.log(
      `Transaction ${transactionId} status updated from ${oldStatus} to ${status} by admin ${adminId}`,
    );

    return transaction;
  }

  /**
   * Cancel a transaction
   */
  async cancelTransaction(
    transactionId: string,
    userId?: string,
    adminId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const where: { id: string; userId?: string } = { id: transactionId };
    if (userId) {
      where.userId = userId;
    }

    const transaction = await this.transactionRepository.findOne({ where });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        'Only pending transactions can be cancelled',
      );
    }

    const oldStatus = transaction.status;
    transaction.status = TransactionStatus.CANCELLED;
    await this.transactionRepository.save(transaction);

    await this.auditLogsService.logTransactionEvent(
      transaction.userId,
      AuditAction.TRANSACTION_CANCELLED,
      transaction.id,
      {
        oldStatus,
        newStatus: transaction.status,
        cancelledBy: adminId ?? userId,
        userCancelled: !!userId && !adminId,
        ip: ipAddress,
        device: userAgent,
      },
    );

    this.logger.log(
      `Transaction ${transactionId} cancelled by ${adminId ?? userId}`,
    );

    return transaction;
  }

  /**
   * Get all transactions for a user with optional filters
   */
  async findAllByUser(
    userId: string,
    query?: TransactionQueryDto,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    if (query?.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: query.type });
    }

    if (query?.currency) {
      queryBuilder.andWhere('transaction.currency = :currency', {
        currency: query.currency,
      });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return { transactions, total };
  }

  /**
   * Get a single transaction by ID
   */
  async findOne(transactionId: string, userId?: string): Promise<Transaction> {
    const where: { id: string; userId?: string } = { id: transactionId };

    if (userId) {
      where.userId = userId;
    }

    const transaction = await this.transactionRepository.findOne({ where });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  /**
   * Get pending transactions that need verification
   */
  async getPendingTransactions(): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { status: TransactionStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async getUserStellarAddress(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.walletPublicKey) {
      throw new BadRequestException(
        'User does not have a Stellar wallet configured',
      );
    }

    return user.walletPublicKey;
  }

  private async getUserStellarSecretKey(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.walletSecretKeyEncrypted) {
      throw new BadRequestException(
        'User does not have a Stellar secret key configured',
      );
    }

    return user.walletSecretKeyEncrypted;
  }

  private async getStellarSecretKey(): Promise<string> {
    const stellarSecret = this.configService.get<string>('STELLAR_HOT_WALLET_SECRET');
    if (stellarSecret) {
      return stellarSecret;
    }

    throw new BadRequestException(
      'Secret key required for this operation. Please provide it securely.',
    );
  }

  private async getUserBalance(
    userId: string,
    currency: string,
  ): Promise<string> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.balances?.[currency] !== undefined) {
      return user.balances[currency].toString();
    }

    return '0.00';
  }

  private async updateUserBalance(
    userId: string,
    currency: string,
    amount: number,
  ): Promise<void> {
    this.logger.log(
      `Updating balance for user ${userId}: ${amount} ${currency}`,
    );

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.balances ??= {};

    const currentBalance = parseFloat(
      user.balances[currency]?.toString() ?? '0',
    );

    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      throw new BadRequestException('Insufficient balance');
    }

    user.balances[currency] = newBalance;

    await this.usersService.updateByUserId(userId, {
      balances: user.balances,
    });

    this.logger.log(
      `Balance updated for user ${userId}: ${currentBalance} -> ${newBalance} ${currency}`,
    );
  }
}

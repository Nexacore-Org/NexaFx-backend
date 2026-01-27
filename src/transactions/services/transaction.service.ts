import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Operation, Asset } from 'stellar-sdk';
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
  ) {}

  /**
   * Create a deposit transaction
   */
  async createDeposit(
    userId: string,
    createDepositDto: CreateDepositDto,
  ): Promise<Transaction> {
    const { amount, currency, sourceAddress } = createDepositDto;

    this.logger.log(
      `Creating deposit for user ${userId}: ${amount} ${currency}`,
    );

    // Validate currency exists and is supported
    const currencyData = await this.currenciesService.findOne(currency);
    if (!currencyData || !currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    // Get exchange rate for the currency
    let rate: string;
    try {
      const exchangeRate = await this.exchangeRatesService.getRate(
        currency,
        'USD',
      );
      rate = exchangeRate.rate.toString();
    } catch (error) {
      this.logger.error(`Failed to get exchange rate for ${currency}`, error);
      throw new BadRequestException(
        `Unable to get exchange rate for ${currency}`,
      );
    }

    // Create transaction record with PENDING status
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
      // Get user's Stellar address for receiving the deposit
      const destinationAddress = await this.getUserStellarAddress(userId);

      // Create payment operation
      const paymentOperation = Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(), // XLM for now, adjust based on your currency mapping
        amount: amount.toString(),
      });

      // Create Stellar transaction
      const stellarTx = await this.stellarService.createTransaction({
        sourcePublicKey: sourceAddress,
        operations: [paymentOperation],
        memo: `DEPOSIT-${transaction.id}`,
      });

      // Get secret key for source address (this should come from secure input)
      const secretKey = await this.getStellarSecretKey(sourceAddress);

      // Sign the transaction
      const signedTx: any = this.stellarService.signTransaction(
        stellarTx,
        secretKey,
      );

      // Submit the transaction
      const result: any = await this.stellarService.submitTransaction(signedTx);
      // Update transaction with hash
      transaction.txHash = result.hash;
      await this.transactionRepository.save(transaction);

      this.logger.log(
        `Deposit transaction created successfully: ${transaction.id}`,
      );

      return transaction;
    } catch (error) {
      this.logger.error(`Failed to create deposit transaction`, error);

      // Update transaction status to FAILED
      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);

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
  ): Promise<Transaction> {
    const { amount, currency, destinationAddress } = createWithdrawalDto;

    this.logger.log(
      `Creating withdrawal for user ${userId}: ${amount} ${currency}`,
    );

    // Validate currency exists and is supported
    const currencyData = await this.currenciesService.findOne(currency);
    if (!currencyData || !currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    // Check user balance
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userBalance = await this.getUserBalance(userId, currency);
    if (parseFloat(userBalance) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Get exchange rate for the currency
    let rate: string;
    try {
      const exchangeRate = await this.exchangeRatesService.getRate(
        currency,
        'USD',
      );
      rate = exchangeRate.rate.toString();
    } catch (error) {
      this.logger.error(`Failed to get exchange rate for ${currency}`, error);
      throw new BadRequestException(
        `Unable to get exchange rate for ${currency}`,
      );
    }

    // Create transaction record with PENDING status
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
      // Get user's Stellar address (source of withdrawal)
      const sourceAddress = await this.getUserStellarAddress(userId);

      // Create payment operation
      const paymentOperation = Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount.toString(),
      });

      // Create Stellar transaction
      const stellarTx = await this.stellarService.createTransaction({
        sourcePublicKey: sourceAddress,
        operations: [paymentOperation],
        memo: `WITHDRAW-${transaction.id}`,
      });

      // Get user's Stellar secret key
      const secretKey = await this.getUserStellarSecretKey(userId);

      // Sign the transaction
      const signedTx = this.stellarService.signTransaction(
        stellarTx,
        secretKey,
      );

      // Submit the transaction
      const result = await this.stellarService.submitTransaction(signedTx);

      // Update transaction with hash
      transaction.txHash = result.hash;
      await this.transactionRepository.save(transaction);

      // Deduct balance immediately for withdrawal
      await this.updateUserBalance(userId, currency, -amount);

      this.logger.log(
        `Withdrawal transaction created successfully: ${transaction.id}`,
      );

      return transaction;
    } catch (error) {
      this.logger.error(`Failed to create withdrawal transaction`, error);

      // Update transaction status to FAILED
      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);

      throw new InternalServerErrorException(
        'Failed to create withdrawal transaction on blockchain',
      );
    }
  }

  /**
   * Verify transaction status on the blockchain
   */
  async verifyTransaction(transactionId: string): Promise<Transaction> {
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

    this.logger.log(`Verifying transaction: ${transactionId}`);

    try {
      const verificationResult = await this.stellarService.verifyTransaction(
        transaction.txHash,
      );

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

        // Refund balance if withdrawal
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
s
      await this.transactionRepository.save(transaction);

      return transaction;
    } catch (error) {
      this.logger.error(`Failed to verify transaction`, error);
      throw new InternalServerErrorException(
        'Failed to verify transaction on blockchain',
      );
    }
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
    const where: any = { id: transactionId };

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

  /**
   * Helper method to get user's Stellar address
   */
  private async getUserStellarAddress(userId: string): Promise<string> {
    const user = await this.usersService.findOne(userId);

    if (!user.stellarAddress) {
      throw new BadRequestException(
        'User does not have a Stellar address configured',
      );
    }

    return user.stellarAddress;
  }

  /**
   * Helper method to get user's Stellar secret key
   */
  private async getUserStellarSecretKey(userId: string): Promise<string> {
    const user = await this.usersService.findOne(userId);

    if (!user.stellarSecretKey) {
      throw new BadRequestException(
        'User does not have a Stellar secret key configured',
      );
    }

    return user.stellarSecretKey;
  }

  /**
   * Helper method to get Stellar secret key for an address
   * This is used for deposits where the source address is external
   */
  private async getStellarSecretKey(address: string): Promise<string> {
    // For deposits, the secret key should be provided by the user
    // or retrieved from a secure source
    // This is a placeholder - implement based on your security requirements

    // Option 1: Return platform's hot wallet secret for receiving deposits
    if (process.env.STELLAR_HOT_WALLET_SECRET) {
      return process.env.STELLAR_HOT_WALLET_SECRET;
    }

    // Option 2: Throw error requiring user to provide secret
    throw new BadRequestException(
      'Secret key required for this operation. Please provide it securely.',
    );
  }

  /**
   * Helper method to get user balance for a currency
   */
  private async getUserBalance(
    userId: string,
    currency: string,
  ): Promise<string> {
    const user = await this.usersService.findOne(userId);

    if (user.balances && user.balances[currency]) {
      return user.balances[currency].toString();
    }

    // Return 0 if no balance found
    return '0.00';
  }

  /**
   * Helper method to update user balance
   * This should handle balance updates atomically
   */
  private async updateUserBalance(
    userId: string,
    currency: string,
    amount: number,
  ): Promise<void> {
    this.logger.log(
      `Updating balance for user ${userId}: ${amount} ${currency}`,
    );

    // Get current user
    const user = await this.usersService.findOne(userId);

    // Initialize balances if not exists
    if (!user.balances) {
      user.balances = {};
    }

    const currentBalance = parseFloat(
      user.balances[currency]?.toString() || '0',
    );

    const newBalance = currentBalance + amount;

    if (newBalance < 0) {
      throw new BadRequestException('Insufficient balance');
    }

    user.balances[currency] = newBalance;

    await this.usersService.update(userId, { balances: user.balances });

    this.logger.log(
      `Balance updated for user ${userId}: ${currentBalance} -> ${newBalance} ${currency}`,
    );
  }
}

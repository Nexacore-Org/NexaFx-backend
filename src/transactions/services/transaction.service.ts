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
import { ConfigService } from '@nestjs/config';
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
  CreateSwapDto,
  TransactionQueryDto,
} from '../dtos/transaction.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { CurrenciesService } from '../../currencies/currencies.service';
import { CurrencyPairService } from '../../currencies/services/currency-pair.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../blockchain/stellar/stellar.service';
import { UsersService } from '../../users/users.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';
import { UserRole } from '../../users/user.entity';
import { ReferralsService } from '../../referrals/referrals.service';
import { FeesService } from '../../fees/fees.service';
import {
  FeeTransactionType,
  FeeType,
} from '../../fees/entities/fee-config.entity';
import { BeneficiariesService } from '../../beneficiaries/beneficiaries.service'; // ← NEW
import { FirebaseService } from '../../firebase/firebase.service';
import { WebhookService } from '../../webhooks/services/webhook.service';

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

// ── Stellar destination pre-validation ───────────────────────────────────────

/** Timeout for the pre-submission Stellar account existence check. */
const STELLAR_ACCOUNT_CHECK_TIMEOUT_MS = 5_000;

/**
 * Verifies that a Stellar account exists and is funded before attempting a
 * payment. Throwing here prevents creating a PENDING transaction that will
 * immediately fail on-chain and waste a fee.
 *
 * Timeout (5 s): the withdrawal still proceeds — the Stellar network will
 * surface the failure if the account really is unfunded.
 *
 * Non-404 errors (network blips, etc.): logged and swallowed so that
 * transient connectivity issues do not block valid withdrawals.
 */
async function validateStellarDestination(
  stellarService: StellarService,
  address: string,
  logger: Logger,
): Promise<void> {
  try {
    await Promise.race([
      stellarService.getWalletBalances(address),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('timeout')),
          STELLAR_ACCOUNT_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === 'timeout') {
      logger.warn(
        `Stellar account validation timed out for ${address} — proceeding with withdrawal`,
      );
      return; // Do not block on timeout
    }

    const is404 =
      message.includes('404') ||
      message.toLowerCase().includes('not found') ||
      message.toLowerCase().includes('does not exist');

    if (is404) {
      throw new BadRequestException(
        'Destination account is not activated on the Stellar network. ' +
          'The recipient must fund their account with at least 1 XLM before ' +
          'a payment can be sent to it.',
      );
    }

    // Transient error — log and allow the submission to proceed
    logger.warn(
      `Stellar destination validation returned a non-404 error for ${address}: ${message}`,
    );
  }
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
    private readonly configService: ConfigService,
    private readonly feesService: FeesService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
    private readonly referralsService: ReferralsService,
    private readonly notificationsService: NotificationsService,
    private readonly beneficiariesService: BeneficiariesService, // ← NEW
    private readonly firebaseService: FirebaseService,
    private readonly webhookService: WebhookService,
    private readonly currencyPairService: CurrencyPairService,
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

    const fee = (await (this as any).feesService?.calculateFee(
      TransactionType.DEPOSIT,
      currency,
      amount,
    )) || { feeAmount: 0, feeCurrency: currency };

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount: amount.toString(),
      currency,
      rate,
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      status: TransactionStatus.PENDING,
    });

    await this.transactionRepository.save(transaction);

    try {
      await (this as any).feesService?.recordFee(transaction.id, userId, fee);

      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.DEPOSIT_CREATED,
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          feeAmount: fee.feeAmount,
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

      const signedTx: StellarTransaction =
        await this.stellarService.signTransaction(stellarTx, secretKey);

      const rawResult: unknown =
        await this.stellarService.submitTransaction(signedTx);

      if (!isStellarSubmitResult(rawResult)) {
        throw new Error('Unexpected response shape from Stellar submit');
      }

      transaction.txHash = rawResult.hash;
      await this.transactionRepository.save(transaction);

      try {
        await this.referralsService.processReferralReward(userId);
      } catch (referralError) {
        const error = toError(referralError);
        this.logger.warn(
          `Referral reward processing failed for user ${userId}: ${error.message}`,
        );
      }

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

      this.sendTransactionNotification(
        userId,
        transaction,
        'FAILED',
        error.message,
      ).catch((e) =>
        this.logger.error(`Failed to send push notification: ${e.message}`),
      );

      throw new InternalServerErrorException(
        'Failed to create deposit transaction on blockchain',
      );
    }
  }

  async createWithdrawal(
    userId: string,
    createWithdrawalDto: CreateWithdrawalDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const { amount, currency, beneficiaryId } = createWithdrawalDto;
    let { destinationAddress } = createWithdrawalDto;

    this.logger.log(
      `Creating withdrawal for user ${userId}: ${amount} ${currency}`,
    );

    // ── Resolve destination address ─────────────────────────────────────────
    if (beneficiaryId) {
      // getBeneficiaryById throws 404 if not found and 403 if not owned by userId
      const beneficiary = await this.beneficiariesService.getBeneficiaryById(
        userId,
        beneficiaryId,
      );

      if (beneficiary.currency.toUpperCase() !== currency.toUpperCase()) {
        throw new BadRequestException(
          `Beneficiary currency (${beneficiary.currency}) does not match ` +
            `the withdrawal currency (${currency}). ` +
            'Please use a beneficiary with the matching currency or supply a destinationAddress directly.',
        );
      }

      destinationAddress = beneficiary.walletAddress;
    }

    if (!destinationAddress) {
      throw new BadRequestException(
        'Either destinationAddress or a valid beneficiaryId must be provided.',
      );
    }
    // ── End resolve destination address ─────────────────────────────────────

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

    const fee = (await (this as any).feesService?.calculateFee(
      TransactionType.WITHDRAW,
      currency,
      amount,
    )) || { feeAmount: 0, feeCurrency: currency };

    const totalDeduction = amount + fee.feeAmount;
    if (parseFloat(userBalance) < totalDeduction) {
      throw new BadRequestException(
        'Insufficient balance to cover the transaction amount and fee',
      );
    }

    await validateStellarDestination(
      this.stellarService,
      destinationAddress,
      this.logger,
    );
    // ── End pre-submission validation ───────────────────────────────────────

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.WITHDRAW,
      amount: amount.toString(),
      currency,
      rate,
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      status: TransactionStatus.PENDING,
    });

    await this.transactionRepository.save(transaction);

    try {
      await (this as any).feesService?.recordFee(transaction.id, userId, fee);

      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.WITHDRAWAL_CREATED,
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          feeAmount: fee.feeAmount,
          destinationAddress,
          beneficiaryId,
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

      if (beneficiaryId) {
        try {
          await this.beneficiariesService.updateLastUsed(beneficiaryId);
        } catch (err) {
          this.logger.warn(
            `Failed to update lastUsedAt for beneficiary ${beneficiaryId}: ${toError(err).message}`,
          );
        }
      }
      // ── End update beneficiary ────────────────────────────────────────────

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

      this.sendTransactionNotification(
        userId,
        transaction,
        'FAILED',
        error.message,
      ).catch((e) =>
        this.logger.error(`Failed to send push notification: ${e.message}`),
      );

      throw new InternalServerErrorException(
        'Failed to create withdrawal transaction on blockchain',
      );
    }
  }

  /**
   * Create a swap transaction using optimal Stellar path routing
   */
  async createSwap(
    userId: string,
    createSwapDto: CreateSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const { amount, fromCurrency, toCurrency, sourceAddress } = createSwapDto;

    this.logger.log(
      `Creating swap for user ${userId}: ${amount} ${fromCurrency} to ${toCurrency}`,
    );

    if (fromCurrency === toCurrency) {
      throw new BadRequestException(
        'Source and destination currencies must be different',
      );
    }

    // 1. Validate Currency Pair
    const pair = await this.currencyPairService.validatePair(
      fromCurrency,
      toCurrency,
    );

    // 2. Check Balance (including fee)
    const userBalance = await this.getUserBalance(userId, fromCurrency);
    if (parseFloat(userBalance) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 3. Calculate Fee
    const fee = (await this.feesService.calculateFee(
      FeeTransactionType.SWAP,
      fromCurrency,
      amount,
    )) || { feeAmount: 0, feeCurrency: fromCurrency, feeType: FeeType.FLAT };

    if (parseFloat(userBalance) < amount + fee.feeAmount) {
      throw new BadRequestException(
        'Insufficient balance to cover the swap amount and fee',
      );
    }

    // 4. Find Best Path
    const fromAsset = this.stellarService['getAsset']
      ? (this.stellarService as any).getAsset(fromCurrency)
      : this.getAssetHelper(fromCurrency);
    const toAsset = this.stellarService['getAsset']
      ? (this.stellarService as any).getAsset(toCurrency)
      : this.getAssetHelper(toCurrency);

    const paths = await this.stellarService.findBestPath(
      fromAsset,
      toAsset,
      amount.toString(),
      'strict-send',
    );

    if (paths.length === 0) {
      throw new BadRequestException({
        code: 'NO_LIQUIDITY_PATH_FOUND',
        message: `No liquidity path found for ${fromCurrency} to ${toCurrency}`,
      });
    }

    // We'll try the paths in order
    let lastError: any = null;
    const maxRetries = 1; // Retry once with next best path

    for (let i = 0; i <= Math.min(maxRetries, paths.length - 1); i++) {
      const bestPath = paths[i];
      const destinationAmount = parseFloat(bestPath.destination_amount);
      const rate = destinationAmount / amount;

      // Apply pair spread
      const effectiveAmount =
        destinationAmount * (1 - pair.spreadPercent / 100);
      const effectiveRate = effectiveAmount / amount;

      const transaction = this.transactionRepository.create({
        userId,
        type: TransactionType.SWAP,
        amount: amount.toString(),
        currency: fromCurrency,
        toCurrency,
        toAmount: effectiveAmount.toFixed(8),
        rate: effectiveRate.toString(),
        feeAmount: fee.feeAmount.toFixed(8),
        feeCurrency: fee.feeCurrency,
        status: TransactionStatus.PENDING,
        metadata: {
          path: bestPath.path,
          originalDestinationAmount: destinationAmount,
          spreadPercent: pair.spreadPercent,
        },
      });

      await this.transactionRepository.save(transaction);

      try {
        await this.feesService.recordFee(transaction.id, userId, fee);

        await this.auditLogsService.logTransactionEvent(
          userId,
          AuditAction.SWAP_CREATED,
          transaction.id,
          {
            amount: transaction.amount,
            fromCurrency: transaction.currency,
            toCurrency: transaction.toCurrency,
            toAmount: transaction.toAmount,
            feeAmount: fee.feeAmount,
            sourceAddress,
            ip: ipAddress,
            device: userAgent,
            retryAttempt: i,
          },
        );

        const destinationAddress = await this.getUserStellarAddress(userId);
        const slippageTolerance = parseFloat(
          process.env.SWAP_SLIPPAGE_PERCENT || '0.005',
        );

        const swapOperation = this.stellarService.buildPathPaymentOp({
          sendAsset: fromAsset,
          sendAmount: amount.toString(),
          destAsset: toAsset,
          destAmount: destinationAmount.toString(),
          destination: destinationAddress,
          path: bestPath.path.map(
            (p) => new Asset(p.asset_code, p.asset_issuer),
          ),
          mode: 'strict-send',
          slippageTolerance,
        });

        const stellarTx = await this.stellarService.createTransaction({
          sourcePublicKey: sourceAddress,
          operations: [swapOperation],
          memo: `SWAP-${transaction.id}`,
        });

        const secretKey = await this.getUserStellarSecretKey(userId);
        const signedTx = await this.stellarService.signTransaction(
          stellarTx,
          secretKey,
        );
        const rawResult = await this.stellarService.submitTransaction(signedTx);

        if (!isStellarSubmitResult(rawResult)) {
          throw new Error('Unexpected response shape from Stellar submit');
        }

        transaction.txHash = rawResult.hash;
        transaction.status = TransactionStatus.SUCCESS;
        await this.transactionRepository.save(transaction);

        await this.updateUserBalance(
          userId,
          fromCurrency,
          -(amount + fee.feeAmount),
        );
        await this.updateUserBalance(userId, toCurrency, effectiveAmount);

        await this.notificationsService.create({
          userId,
          type: NotificationType.SWAP_COMPLETED,
          title: 'Swap Completed',
          message: `Successfully swapped ${amount} ${fromCurrency} to ${effectiveAmount.toFixed(2)} ${toCurrency}`,
          relatedId: transaction.id,
        });

        this.logger.log(
          `Swap transaction completed successfully: ${transaction.id} (Attempt ${i})`,
        );

        this.webhookService
          .dispatch('transaction.completed', transaction, userId)
          .catch((e) =>
            this.logger.error(`Webhook dispatch failed: ${e.message}`),
          );

        return transaction;
      } catch (err) {
        const error = toError(err);
        this.logger.warn(
          `Failed attempt ${i} to execute swap: ${error.message}`,
        );

        transaction.status = TransactionStatus.FAILED;
        transaction.failureReason = error.message;
        await this.transactionRepository.save(transaction);

        lastError = error;

        // Check if error is slippage-related (op_under_dest_min or similar)
        const isSlippageError =
          error.message.includes('op_under_dest_min') ||
          error.message.includes('tx_too_late') ||
          error.message.includes('op_over_source_max');

        if (!isSlippageError || i === Math.min(maxRetries, paths.length - 1)) {
          throw new BadRequestException(`Swap failed: ${error.message}`);
        }

        this.logger.log(
          `Retrying swap with next best path due to slippage error...`,
        );
      }
    }

    throw new BadRequestException(
      `Swap failed: ${lastError?.message || 'Unknown error'}`,
    );
  }

  private getAssetHelper(code: string): Asset {
    if (code === 'XLM') return Asset.native();
    // In a real app, you'd fetch the issuer from the database or config
    // Using a default issuer for demonstration as seen in the original code
    return new Asset(
      code,
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335XPB7X3NCQXMK3SBEG3CIFE7G',
    );
  }

  private swapPreviewCache = new Map<string, { data: any; expiry: number }>();

  async getSwapPreview(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    mode: 'strict-send' | 'strict-receive' = 'strict-send',
  ): Promise<any> {
    const cacheKey = `${fromCurrency}-${toCurrency}-${amount}-${mode}`;
    const cached = this.swapPreviewCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      this.logger.debug(`Returning cached swap preview for ${cacheKey}`);
      return cached.data;
    }

    const fromAsset = this.getAssetHelper(fromCurrency);
    const toAsset = this.getAssetHelper(toCurrency);

    const paths = await this.stellarService.findBestPath(
      fromAsset,
      toAsset,
      amount.toString(),
      mode,
    );

    if (paths.length === 0) {
      throw new BadRequestException({
        code: 'NO_LIQUIDITY_PATH_FOUND',
        message: `No liquidity path found for ${fromCurrency} to ${toCurrency}`,
      });
    }

    const pair = await this.currencyPairService.findByCodes(
      fromCurrency,
      toCurrency,
    );
    const spreadPercent = pair ? pair.spreadPercent : 0;

    const results = paths.map((path) => {
      const destAmount = parseFloat(path.destination_amount);
      const sourceAmount = parseFloat(path.source_amount);

      // Apply spread
      const effectiveDestAmount =
        mode === 'strict-send'
          ? destAmount * (1 - spreadPercent / 100)
          : destAmount;

      const effectiveSourceAmount =
        mode === 'strict-receive'
          ? sourceAmount * (1 + spreadPercent / 100)
          : sourceAmount;

      return {
        sourceAsset: path.source_asset_code || 'XLM',
        sourceAmount: effectiveSourceAmount,
        destinationAsset: path.destination_asset_code || 'XLM',
        destinationAmount: effectiveDestAmount,
        path: path.path,
        spreadApplied: spreadPercent,
      };
    });

    // Cache results for 10 seconds
    this.swapPreviewCache.set(cacheKey, {
      data: results,
      expiry: Date.now() + 10000,
    });

    return results;
  }

  /**
   * Verify transaction status on the blockchain
   */
  async verifyTransaction(
    transactionId: string,
    requestingUserId?: string,
    requestingUserRole?: UserRole,
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
    if (
      requestingUserId &&
      !isAdmin &&
      transaction.userId !== requestingUserId
    ) {
      throw new ForbiddenException(
        'You do not have permission to verify this transaction',
      );
    }

    if (
      requestingUserRole &&
      !isAdmin &&
      transaction.status !== TransactionStatus.PENDING
    ) {
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

      if (
        transaction.status === TransactionStatus.SUCCESS ||
        transaction.status === TransactionStatus.FAILED
      ) {
        this.sendTransactionNotification(
          transaction.userId,
          transaction,
          transaction.status,
          transaction.failureReason ?? undefined,
        ).catch((e) =>
          this.logger.error(`Failed to send push notification: ${e.message}`),
        );
      }

      if (transaction.status === TransactionStatus.SUCCESS) {
        this.webhookService
          .dispatch('transaction.completed', transaction, transaction.userId)
          .catch((e) =>
            this.logger.error(`Webhook dispatch failed: ${e.message}`),
          );
      } else if (transaction.status === TransactionStatus.FAILED) {
        this.webhookService
          .dispatch('transaction.failed', transaction, transaction.userId)
          .catch((e) =>
            this.logger.error(`Webhook dispatch failed: ${e.message}`),
          );
      }

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

    if (
      status === TransactionStatus.SUCCESS ||
      status === TransactionStatus.FAILED
    ) {
      this.sendTransactionNotification(
        transaction.userId,
        transaction,
        status,
        transaction.failureReason ?? undefined,
      ).catch((e) =>
        this.logger.error(`Failed to send push notification: ${e.message}`),
      );
    }

    return transaction;
  }

  /**
   * Cancel a transaction (user-initiated)
   */
  async cancelTransaction(
    transactionId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to cancel this transaction',
      );
    }

    if (transaction.status !== TransactionStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel transaction with status ${transaction.status}. Only PENDING transactions can be cancelled.`,
      );
    }

    if (transaction.txHash) {
      this.logger.warn(
        `Transaction ${transactionId} has already been submitted to Stellar (txHash: ${transaction.txHash}). Cancelling in DB but on-chain state may differ.`,
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
        cancelledBy: userId,
        userCancelled: true,
        ip: ipAddress,
        device: userAgent,
        txHash: transaction.txHash,
      },
    );

    this.logger.log(`Transaction ${transactionId} cancelled by user ${userId}`);

    return transaction;
  }

  /**
   * Get all transactions for a user with optional filters
   */
  async findAllByUser(
    userId: string,
    query?: TransactionQueryDto,
  ): Promise<{ transactions: any[]; total: number }> {
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

    const uniqueCurrencies: string[] = Array.from(
      new Set(
        transactions
          .map((t) => t.currency)
          .filter((c): c is string => !!c)
          .concat(
            transactions
              .map((t) => t.feeCurrency)
              .filter((c): c is string => !!c),
          ),
      ),
    );

    const currencyLookup: Record<string, any> = {};

    try {
      for (const currencyCode of uniqueCurrencies) {
        // @ts-ignore - Pre-existing type issue
        const currency = await this.currenciesService.getCurrency(currencyCode);
        // @ts-ignore - Pre-existing type issue
        currencyLookup[currencyCode] = {
          symbol: currency.symbol || currencyCode,
          displayName: currency.name || currencyCode,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch currency metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      for (const currencyCode of uniqueCurrencies) {
        // @ts-ignore - Pre-existing type issue
        currencyLookup[currencyCode] = {
          symbol: currencyCode,
          displayName: currencyCode,
        };
      }
    }

    const enrichedTransactions = transactions.map((transaction) => ({
      ...transaction,
      currencySymbol:
        currencyLookup[transaction.currency]?.symbol || transaction.currency,
      currencyDisplayName:
        currencyLookup[transaction.currency]?.displayName ||
        transaction.currency,
    }));

    return { transactions: enrichedTransactions, total };
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
    const stellarSecret = (this as any).configService?.get(
      'STELLAR_HOT_WALLET_SECRET',
    ) as string | undefined;
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
      `Updated user ${userId} balance for ${currency}. New balance: ${newBalance}`,
    );
  }

  private async sendTransactionNotification(
    userId: string,
    transaction: Transaction,
    status: 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'PENDING',
    failureReason?: string,
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;

      const actionText =
        transaction.type === TransactionType.DEPOSIT ? 'Deposit' : 'Withdrawal';
      let title = '';
      let body = '';

      if (status === 'SUCCESS') {
        title = `${actionText} Successful`;
        body = `Your ${transaction.type.toLowerCase()} of ${transaction.amount} ${transaction.currency} was successful.`;
      } else if (status === 'FAILED') {
        title = `${actionText} Failed`;
        body = `Your ${transaction.type.toLowerCase()} of ${transaction.amount} ${transaction.currency} failed.`;
        if (failureReason) {
          body += ` Reason: ${failureReason}`;
        }
      } else {
        return;
      }

      await this.firebaseService.sendToTokens(user.fcmTokens, title, body, {
        transactionId: transaction.id,
        type: transaction.type,
      });
    } catch (e) {
      // Intentionally swallow errors so it doesn't break flows
    }
  }
}

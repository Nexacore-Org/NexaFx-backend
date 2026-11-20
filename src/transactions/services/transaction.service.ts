import { Operation, Asset } from 'stellar-sdk';
import { randomBytes, createHash } from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { BalanceService } from '../../balances/balance.service';
import { toDecimal } from '../../balances/decimal.util';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/transaction.entity';
import { TransactionCategory } from '../../analytics/entities/transaction-category.entity';
import {
  CreateDepositDto,
  CreateWithdrawalDto,
  CreateSwapDto,
  TransactionQueryDto,
  TagUsageDto,
} from '../dtos/transaction.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { CurrenciesService } from '../../currencies/currencies.service';
import { Currency } from '../../currencies/currency.entity';
import { CurrencyPairService } from '../../currencies/services/currency-pair.service';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { StellarService } from '../../modules/stellar/stellar.service';
import { TransactionSubmissionError } from '../../modules/stellar/stellar.errors';
import { UsersService } from '../../users/users.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';
import { UserRole } from '../../users/user.entity';
import { ReferralsService } from '../../referrals/referrals.service';
import { CalculatedFee, FeesService } from '../../fees/fees.service';
import {
  FeeTransactionType,
  FeeType,
} from '../../fees/entities/fee-config.entity';
import { BeneficiariesService } from '../../beneficiaries/beneficiaries.service'; // ← NEW
import { FirebaseService } from '../../firebase/firebase.service';
import { WebhookService } from '../../webhooks/services/webhook.service';
import { WalletsService } from '../../wallets/wallets.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { TransactionLimitService } from './transaction-limit.service';
import { AmlService } from '../../modules/compliance/aml.service';
import { RedisService } from '../../modules/redis/redis.service';
import { MicroSavingsService } from '../../modules/micro-savings/micro-savings.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TAX_QUEUE } from '../../modules/queues/queue.constants';
import { UnifiedActivityFeedService } from '../../unified-activity-feed/unified-activity-feed.service';
import { ActivityFeedType } from '../../unified-activity-feed/entities/activity-feed-item.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Truncates a memo string to at most 28 UTF-8 bytes, the Stellar memo_text limit.
 * Splits on a character boundary so the result is always valid UTF-8.
 */
export function truncateMemoTo28Bytes(memo: string): string {
  const encoded = Buffer.from(memo, 'utf8');
  if (encoded.length <= 28) return memo;
  return encoded
    .slice(0, 28)
    .toString('utf8')
    .replace(/\uFFFD/g, '');
}

export function buildStellarMemo(prefix: 'W' | 'S', transactionId: string): string {
  const hash = createHash('sha256')
    .update(transactionId)
    .digest('hex')
    .slice(0, 26);
  return `${prefix}-${hash}`;
}

/** One signed-free balance movement in a single currency. */
interface BalanceMovement {
  currency: string;
  amount: Decimal.Value;
}

/** Narrows an unknown catch value to a plain Error with a message string. */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** Type guard for the Stellar submit result shape we depend on. */
interface StellarSubmitResult {
  hash: string;
}

type DepositTransaction = Transaction & {
  depositAddress: string;
  depositMemo: string;
};

function isStellarSubmitResult(value: unknown): value is StellarSubmitResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'hash' in value &&
    typeof (value as Record<string, unknown>).hash === 'string'
  );
}

/**
 * Slippage-style Horizon failures are identified by structured result codes,
 * not by parsing a human-readable message (which used to be "[object Object]").
 */
function isSlippageSubmissionError(error: Error): boolean {
  const resultCodes =
    error instanceof TransactionSubmissionError ? error.resultCodes : undefined;
  const codes = [
    ...(resultCodes?.transaction ? [resultCodes.transaction] : []),
    ...(resultCodes?.operations ?? []),
  ];
  const haystack = `${error.message} ${codes.join(' ')}`;

  return (
    haystack.includes('op_under_dest_min') ||
    haystack.includes('tx_too_late') ||
    haystack.includes('op_over_source_max')
  );
}

// ── Stellar destination pre-validation ───────────────────────────────────────

/** Timeout for the pre-submission Stellar account existence check. */
const STELLAR_ACCOUNT_CHECK_TIMEOUT_MS = 5_000;

const STELLAR_TRANSACTION_TIME_BOUND_MS = 180_000;
const NOT_FOUND_GRACE_MARGIN_MS = 60_000;

/**
 * The only legal status changes. A PENDING transaction can settle exactly
 * once; SUCCESS, FAILED and CANCELLED are terminal. Anything else is a 409,
 * because a later change would not be matched by a balance or ledger
 * adjustment and the books would diverge from the chain.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<
  TransactionStatus,
  TransactionStatus[]
> = {
  [TransactionStatus.PENDING]: [
    TransactionStatus.SUCCESS,
    TransactionStatus.FAILED,
    TransactionStatus.CANCELLED,
  ],
  [TransactionStatus.SUCCESS]: [],
  [TransactionStatus.FAILED]: [],
  [TransactionStatus.CANCELLED]: [],
};

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
  private readonly limitsService?: any;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(TransactionCategory)
    private readonly categoryRepository: Repository<TransactionCategory>,
    private readonly dataSource: DataSource,
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
    private readonly walletsService: WalletsService,
    private readonly encryptionService: EncryptionService,
    private readonly ledgerService: LedgerService,
    private readonly transactionLimitService: TransactionLimitService,
    private readonly amlService: AmlService,
    private readonly redisService: RedisService,
    private readonly microSavingsService: MicroSavingsService,
    @InjectQueue(TAX_QUEUE)
    private readonly taxQueue: Queue,
    private readonly activityFeedService: UnifiedActivityFeedService,
    private readonly balanceService: BalanceService,
  ) {}

  /**
   * Create a deposit transaction
   */
  async createDeposit(
    userId: string,
    createDepositDto: CreateDepositDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<DepositTransaction> {
    const { amount, currency } = createDepositDto;

    this.logger.log(
      `Creating deposit for user ${userId}: ${amount} ${currency}`,
    );

    let currencyData: Currency;
    try {
      currencyData = await this.currenciesService.getCurrency(currency);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Currency ${currency} is not supported or inactive`,
        );
      }
      throw error;
    }
    if (!currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    if (this.limitsService) {
      await this.limitsService.checkLimit(
        userId,
        TransactionType.DEPOSIT,
        amount,
        currency,
      );
    } else {
      await this.transactionLimitService.check(userId, amount, currency);
    }

    let rate: string;
    try {
      const exchangeRate = await this.exchangeRatesService.getFreshRate(
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

    const fee = this.limitsService
      ? await this.limitsService.calculateFee(
          TransactionType.DEPOSIT,
          amount,
          currency,
        )
      : (await (this as any).feesService?.calculateFee(
          TransactionType.DEPOSIT,
          currency,
          amount,
        )) || { feeAmount: 0, feeCurrency: currency, feeType: FeeType.FLAT };

    const depositAddress = await this.getUserStellarAddress(
      userId,
      createDepositDto.walletId,
      true,
    );
    const depositMemo = randomBytes(14).toString('hex');

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.DEPOSIT,
      amount: amount.toString(),
      currency,
      rate,
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      status: TransactionStatus.PENDING,
      counterpartyMemo: createDepositDto.memo ?? null,
      metadata: {
        depositAddress,
        depositMemo,
      },
    });

    try {
      await this.persistTransactionArtifacts(transaction, fee);

      await this.auditLogsService.logTransactionEvent(
        userId,
        AuditAction.DEPOSIT_CREATED,
        transaction.id,
        {
          amount: transaction.amount,
          currency: transaction.currency,
          feeAmount: fee.feeAmount,
          depositAddress,
          depositMemo,
          ip: ipAddress,
          device: userAgent,
        },
      );

      this.logger.log(
        `Deposit instructions created successfully: ${transaction.id}`,
      );

      this.autoAssignCategory(transaction).catch((e) =>
        this.logger.warn(
          `Non-blocking category assignment failed: ${e.message}`,
        ),
      );

      return {
        ...transaction,
        depositAddress,
        depositMemo,
      };
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to create deposit transaction`, error);

      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);
      // The PENDING insert already wrote ledger entries: reverse them so the
      // failed deposit nets to zero.
      await this.ledgerService.reverse(transaction);

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
    if (this.limitsService) {
      return this.createWithdrawalTransaction(
        userId,
        createWithdrawalDto,
        ipAddress,
        userAgent,
      );
    }

    return this.transactionLimitService.withLimitCheck(
      userId,
      createWithdrawalDto.amount,
      createWithdrawalDto.currency,
      () =>
        this.createWithdrawalTransaction(
          userId,
          createWithdrawalDto,
          ipAddress,
          userAgent,
        ),
    );
  }

  private async createWithdrawalTransaction(
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

    let currencyData: Currency;
    try {
      currencyData = await this.currenciesService.getCurrency(currency);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Currency ${currency} is not supported or inactive`,
        );
      }
      throw error;
    }
    if (!currencyData.isActive) {
      throw new BadRequestException(
        `Currency ${currency} is not supported or inactive`,
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (this.limitsService) {
      await this.limitsService.checkLimit(
        userId,
        TransactionType.WITHDRAW,
        amount,
        currency,
      );
    }

    const userBalance = await this.getUserBalance(userId, currency);
    if (!BalanceService.isSufficient(userBalance, amount)) {
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
      const exchangeRate = await this.exchangeRatesService.getFreshRate(
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

    const fee = this.limitsService
      ? await this.limitsService.calculateFee(
          TransactionType.WITHDRAW,
          amount,
          currency,
        )
      : (await (this as any).feesService?.calculateFee(
          TransactionType.WITHDRAW,
          currency,
          amount,
        )) || { feeAmount: 0, feeCurrency: currency, feeType: FeeType.FLAT };

    const feeCurrency = (fee.feeCurrency ?? currency).toUpperCase();
    const sameCurrencyFee = feeCurrency === currency.toUpperCase();
    const totalDeduction = toDecimal(amount).plus(
      sameCurrencyFee ? toDecimal(fee.feeAmount) : 0,
    );
    if (!BalanceService.isSufficient(userBalance, totalDeduction)) {
      throw new BadRequestException(
        'Insufficient balance to cover the transaction amount and fee',
      );
    }

    if (!sameCurrencyFee && fee.feeAmount > 0) {
      const feeBalance = await this.getUserBalance(userId, fee.feeCurrency);
      if (!BalanceService.isSufficient(feeBalance, fee.feeAmount)) {
        throw new BadRequestException(
          'Insufficient balance to cover the transaction fee',
        );
      }
    }

    await validateStellarDestination(
      this.stellarService,
      destinationAddress,
      this.logger,
    );
    // ── End pre-submission validation ───────────────────────────────────────

    // Reserve the funds BEFORE anything is sent on-chain. Each debit is one
    // atomic conditional UPDATE and all of them commit together, so two
    // concurrent withdrawals can never both spend the same balance. Nothing
    // is persisted yet, so losing the race fails cleanly with a 400.
    const reservedDebits: BalanceMovement[] = sameCurrencyFee
      ? [{ currency, amount: totalDeduction }]
      : [
          { currency, amount: toDecimal(amount) },
          ...(fee.feeAmount > 0
            ? [{ currency: fee.feeCurrency, amount: toDecimal(fee.feeAmount) }]
            : []),
        ];
    await this.reserveFunds(userId, reservedDebits);
    let submitted = false;

    const transaction = this.transactionRepository.create({
      userId,
      type: TransactionType.WITHDRAW,
      amount: amount.toString(),
      currency,
      rate,
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      status: TransactionStatus.PENDING,
      counterpartyMemo: createWithdrawalDto.memo ?? null,
    });

    try {
      await this.persistTransactionArtifacts(transaction, fee);

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

      const stellarMemo = createWithdrawalDto.memo
        ? truncateMemoTo28Bytes(createWithdrawalDto.memo)
        : buildStellarMemo('W', transaction.id);
      const sourceAddress = await this.getUserStellarAddress(
        userId,
        createWithdrawalDto.walletId,
      );

      const paymentAsset = currencyData.issuer
        ? this.stellarService.getAssetWithDefaultIssuer(
            currency,
            currencyData.issuer,
          )
        : this.stellarService.getAssetWithDefaultIssuer(currency);
      const paymentOperation = Operation.payment({
        destination: destinationAddress,
        asset: paymentAsset,
        amount: amount.toString(),
      });

      await this.stellarService.createTransaction({
        sourcePublicKey: sourceAddress,
        operations: [paymentOperation],
        memo: stellarMemo,
      });

      const secretKey = await this.getUserStellarSecretKey(
        userId,
        createWithdrawalDto.walletId,
      );

      const paymentResult = await this.stellarService.sendPayment({
        sourcePublicKey: sourceAddress,
        destination: destinationAddress,
        asset: paymentAsset,
        amount: amount.toString(),
        memo: stellarMemo,
        secretKey,
        userId,
      });

      // Funds left the account on-chain: the reservation is now final.
      submitted = true;
      transaction.txHash = paymentResult.hash;
      transaction.stellarTxHash = paymentResult.hash;
      await this.transactionRepository.save(transaction);

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

      this.autoAssignCategory(transaction).catch((e) =>
        this.logger.warn(
          `Non-blocking category assignment failed: ${e.message}`,
        ),
      );

      return transaction;
    } catch (err) {
      const error = toError(err);
      this.logger.error(`Failed to create withdrawal transaction`, error);

      if (!submitted) {
        await this.refundFunds(userId, reservedDebits, transaction.id);
      }

      transaction.status = TransactionStatus.FAILED;
      transaction.failureReason = error.message;
      await this.transactionRepository.save(transaction);
      await this.ledgerService.reverse(transaction);

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
    if (this.limitsService) {
      return this.createSwapTransaction(
        userId,
        createSwapDto,
        ipAddress,
        userAgent,
      );
    }

    return this.transactionLimitService.withLimitCheck(
      userId,
      createSwapDto.amount,
      createSwapDto.fromCurrency,
      () =>
        this.createSwapTransaction(
          userId,
          createSwapDto,
          ipAddress,
          userAgent,
        ),
    );
  }

  private async createSwapTransaction(
    userId: string,
    createSwapDto: CreateSwapDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Transaction> {
    const { amount, fromCurrency, toCurrency, sourceAddress, walletId } =
      createSwapDto;

    this.logger.log(
      `Creating swap for user ${userId}: ${amount} ${fromCurrency} to ${toCurrency}`,
    );

    if (this.limitsService) {
      await this.limitsService.checkLimit(
        userId,
        TransactionType.SWAP,
        amount,
        fromCurrency,
      );
    }

    if (fromCurrency === toCurrency) {
      throw new BadRequestException(
        'Source and destination currencies must be different',
      );
    }

    // 1. Validate Currency Pair
    const amountUsd =
      fromCurrency.toUpperCase() === 'USD'
        ? amount
        : amount *
          (
            await this.exchangeRatesService.getFreshRate(fromCurrency, 'USD')
          ).rate;
    const pair = await this.currencyPairService.validatePair(
      fromCurrency,
      toCurrency,
      amountUsd,
    );

    // 2. Check Balance (including fee)
    const userBalance = await this.getUserBalance(userId, fromCurrency);
    if (!BalanceService.isSufficient(userBalance, amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // 3. Calculate Fee
    const fee = this.limitsService
      ? await this.limitsService.calculateFee(
          TransactionType.SWAP,
          amount,
          fromCurrency,
        )
      : (await this.feesService.calculateFee(
          FeeTransactionType.SWAP,
          fromCurrency,
          amount,
        )) || {
          feeAmount: 0,
          feeCurrency: fromCurrency,
          feeType: FeeType.FLAT,
        };

    const swapDebit = toDecimal(amount).plus(toDecimal(fee.feeAmount));
    if (!BalanceService.isSufficient(userBalance, swapDebit)) {
      throw new BadRequestException(
        'Insufficient balance to cover the swap amount and fee',
      );
    }

    const txWallet = await this.walletsService.resolveWalletForTransaction(
      userId,
      walletId,
    );
    if (sourceAddress !== txWallet.publicKey) {
      throw new BadRequestException(
        'sourceAddress must match the public key of the wallet used for this swap',
      );
    }

    // 4. Find Best Path
    const fromAsset = await this.getAssetHelper(fromCurrency);
    const toAsset = await this.getAssetHelper(toCurrency);

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

      // Reserve amount + fee atomically before submitting. Refunded in the
      // catch below if this attempt fails before the swap reaches the network.
      const swapReservation: BalanceMovement[] = [
        { currency: fromCurrency, amount: swapDebit },
      ];
      await this.reserveFunds(userId, swapReservation);

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
        counterpartyMemo: createSwapDto.memo ?? null,
        metadata: {
          path: bestPath.path,
          originalDestinationAmount: destinationAmount,
          spreadPercent: pair.spreadPercent,
        },
      });

      await this.persistTransactionArtifacts(transaction, fee);

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

      let submittedHash = '';
      try {
        const destinationAddress = txWallet.publicKey;
        const slippageTolerance = parseFloat(
          process.env.SWAP_SLIPPAGE_PERCENT || '0.005',
        );

        const swapOperation = this.stellarService.buildPathPaymentOp({
          sendAsset: fromAsset,
          sendAmount: amount.toString(),
          destAsset: toAsset,
          destAmount: destinationAmount.toString(),
          destination: destinationAddress,
          path: bestPath.path.map((p) =>
            this.stellarService.getAsset(p.asset_code, p.asset_issuer),
          ),
          mode: 'strict-send',
          slippageTolerance,
        });

        const swapMemo = createSwapDto.memo
          ? truncateMemoTo28Bytes(createSwapDto.memo)
          : buildStellarMemo('S', transaction.id);

        const stellarTx = await this.stellarService.createTransaction({
          sourcePublicKey: txWallet.publicKey,
          operations: [swapOperation],
          memo: swapMemo,
        });

        const secretKey = await this.getUserStellarSecretKey(userId, walletId);
        const signedTx = await this.stellarService.signTransaction(
          stellarTx,
          secretKey,
        );
        const rawResult = await this.stellarService.submitTransaction(signedTx);

        if (!isStellarSubmitResult(rawResult)) {
          throw new Error('Unexpected response shape from Stellar submit');
        }

        submittedHash = rawResult.hash;
      } catch (err) {
        const error = toError(err);
        this.logger.warn(
          `Failed attempt ${i} to execute swap: ${error.message}`,
        );

        // Nothing reached the network (submit is the last statement of the
        // try block), so give the reserved funds back.
        await this.refundFunds(userId, swapReservation, transaction.id);

        transaction.status = TransactionStatus.FAILED;
        transaction.failureReason = error.message;
        await this.transactionRepository.save(transaction);

        lastError = error;

        const isSlippageError = isSlippageSubmissionError(error);

        if (!isSlippageError || i === Math.min(maxRetries, paths.length - 1)) {
          throw new BadRequestException(`Swap failed: ${error.message}`);
        }

        this.logger.log(
          `Retrying swap with next best path due to slippage error...`,
        );
        continue;
      }

      transaction.txHash = submittedHash;
      transaction.stellarTxHash = submittedHash;
      transaction.status = TransactionStatus.SUCCESS;
      await this.transactionRepository.save(transaction);

      // The debit was reserved above; only the destination credit remains.
      await this.runBestEffort(
        () =>
          this.updateUserBalance(
            userId,
            toCurrency,
            effectiveAmount.toFixed(8),
          ),
        `swap destination credit for transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.activityFeedService.append(
            transaction.userId,
            ActivityFeedType.TRANSACTION_COMPLETE,
            transaction.id,
            'Transaction',
          ),
        `activity feed append for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () => this.redisService.delete('admin_stats'),
        `admin stats cache invalidation for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.taxQueue.add('process-transaction', {
            transactionId: transaction.id,
          }),
        `tax enqueue for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.notificationsService.dispatch(
            userId,
            NotificationType.TRANSACTION,
            'Swap Completed',
            `Successfully swapped ${amount} ${fromCurrency} to ${effectiveAmount.toFixed(2)} ${toCurrency}`,
            { transactionId: transaction.id },
          ),
        `swap notification for transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () => this.autoAssignCategory(transaction),
        `category assignment for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.webhookService.dispatch(
            'transaction.completed',
            transaction,
            userId,
          ),
        `webhook dispatch for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () => this.amlService.enqueue(transaction.id),
        `AML enqueue for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.microSavingsService.evaluatePerTransaction(
            userId,
            transaction.id,
            parseFloat(transaction.amount),
            fromCurrency,
          ),
        `micro-savings evaluation for swap transaction ${transaction.id}`,
      );
      await this.runBestEffort(
        () =>
          this.microSavingsService.evaluateBalanceThreshold(
            userId,
            fromCurrency,
          ),
        `micro-savings threshold evaluation for swap transaction ${transaction.id}`,
      );

      this.logger.log(
        `Swap transaction completed successfully: ${transaction.id} (Attempt ${i})`,
      );

      return transaction;
    }

    throw new BadRequestException(
      `Swap failed: ${lastError?.message || 'Unknown error'}`,
    );
  }

  private async getAssetHelper(code: string): Promise<Asset> {
    try {
      return this.stellarService.getAssetWithDefaultIssuer(code);
    } catch (error: unknown) {
      if (
        !(error instanceof Error) ||
        !error.message.includes('No Stellar issuer configured')
      ) {
        throw error;
      }

      const currency = await this.currenciesService.getCurrency(code);
      if (!currency.issuer) throw error;

      return this.stellarService.getAsset(code, currency.issuer);
    }
  }

  private swapPreviewCache = new Map<string, { data: any; expiry: number }>();

  async getSwapPreview(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    mode: 'strict-send' | 'strict-receive' = 'strict-send',
  ): Promise<any> {
    const pair = await this.currencyPairService.validatePair(
      fromCurrency,
      toCurrency,
    );

    const cacheKey = `${fromCurrency}-${toCurrency}-${amount}-${mode}`;
    const redisKey = this.redisService.key('quotes', cacheKey);
    const redisCached = await this.redisService.getJson<any>(redisKey);
    if (redisCached) {
      this.logger.debug(`Returning Redis cached swap preview for ${cacheKey}`);
      return redisCached;
    }

    const cached = this.swapPreviewCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      this.logger.debug(`Returning cached swap preview for ${cacheKey}`);
      return cached.data;
    }

    const fromAsset = await this.getAssetHelper(fromCurrency);
    const toAsset = await this.getAssetHelper(toCurrency);

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

    const spreadPercent = pair.spreadPercent;

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

    await this.redisService.setJson(redisKey, results, 30);

    // Local fallback cache mirrors Redis TTL for single-instance degradation.
    this.swapPreviewCache.set(cacheKey, {
      data: results,
      expiry: Date.now() + 30000,
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

    const isAdmin =
      requestingUserRole === UserRole.ADMIN ||
      requestingUserRole === UserRole.SUPER_ADMIN;
    if (
      requestingUserId &&
      !isAdmin &&
      transaction.userId !== requestingUserId
    ) {
      throw new ForbiddenException(
        'You do not have permission to verify this transaction',
      );
    }

    if (!transaction.txHash) {
      // Deposits are created without a txHash, so they must be matched against
      // Horizon before verification. Only non-matchable rows are rejected here.
      const canAutoDetectDeposit =
        transaction.type === TransactionType.DEPOSIT &&
        transaction.status === TransactionStatus.PENDING &&
        Boolean(transaction.metadata?.depositAddress) &&
        Boolean(transaction.metadata?.depositMemo);

      if (!canAutoDetectDeposit) {
        throw new BadRequestException(
          'Transaction does not have a blockchain hash yet',
        );
      }

      let currencyIssuer: string | undefined;
      try {
        const currency = await this.currenciesService.getCurrency(
          transaction.currency,
        );
        currencyIssuer = currency.issuer ?? undefined;
      } catch {
        currencyIssuer = undefined;
      }

      const inboundPayment = await this.stellarService.findIncomingPayment({
        address: transaction.metadata.depositAddress,
        amount: transaction.amount,
        currency: transaction.currency,
        ...(currencyIssuer ? { issuer: currencyIssuer } : {}),
        memo: transaction.metadata.depositMemo,
        createdAfter: transaction.createdAt,
      });
      if (!inboundPayment) {
        return transaction;
      }

      transaction.txHash = inboundPayment.hash;
      transaction.stellarTxHash = inboundPayment.hash;
      await this.transactionRepository.save(transaction);
    }

    // Unconditional for interactive callers: the old guard only ran when a
    // role was passed, and the controller passed undefined, so an already
    // verified transaction could be re-verified (and re-credited) forever.
    // The internal scheduler passes requestingUserId 'system' and is exempt.
    const isSystemCaller = requestingUserId === 'system';
    if (
      !isAdmin &&
      !isSystemCaller &&
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
      const isNotFound = verificationResult.status === 'NOT_FOUND';
      const createdAt = new Date(transaction.createdAt).getTime();
      const isExpiredNotFound =
        isNotFound &&
        Number.isFinite(createdAt) &&
        Date.now() - createdAt >
          STELLAR_TRANSACTION_TIME_BOUND_MS + NOT_FOUND_GRACE_MARGIN_MS;

      if (verificationResult.status === 'SUCCESS') {
        // Claim the transition atomically: only the caller that actually moved
        // the row out of PENDING runs side effects, so repeated or concurrent
        // verify calls cannot inflate the balance or duplicate events.
        const claimed = await this.transactionRepository.update(
          { id: transactionId, status: TransactionStatus.PENDING },
          { status: TransactionStatus.SUCCESS },
        );

        if ((claimed.affected ?? 0) === 0) {
          this.logger.warn(
            `Transaction ${transactionId} was already transitioned from ${oldStatus}; skipping verification side effects`,
          );
          return transaction;
        }

        transaction.status = TransactionStatus.SUCCESS;
        await this.activityFeedService.append(
          transaction.userId,
          ActivityFeedType.TRANSACTION_COMPLETE,
          transaction.id,
          'Transaction',
        );
        await this.redisService.delete('admin_stats');

        if (transaction.type === TransactionType.DEPOSIT) {
          await this.applyTransitionBalanceEffects(
            transaction,
            TransactionStatus.SUCCESS,
          );
          try {
            await this.referralsService.processReferralReward(
              transaction.userId,
            );
          } catch (referralError) {
            const error = toError(referralError);
            this.logger.warn(
              `Referral reward processing failed for user ${transaction.userId}: ${error.message}`,
            );
          }
        }

        this.logger.log(`Transaction verified successfully: ${transactionId}`);
      } else if (verificationResult.status === 'FAILED' || isExpiredNotFound) {
        transaction.status = TransactionStatus.FAILED;
        transaction.failureReason = isNotFound
          ? 'Transaction hash was not found on the blockchain after the time bound'
          : 'Transaction verification failed on blockchain';

        // The FAILED transition must be claimed from PENDING as well. Using the
        // in-memory status here let an admin re-verify an already-FAILED
        // withdrawal and mint another refund on every call.
        const claimed = await this.transactionRepository.update(
          { id: transactionId, status: TransactionStatus.PENDING },
          {
            status: TransactionStatus.FAILED,
            failureReason: transaction.failureReason,
          },
        );
        if ((claimed.affected ?? 0) === 0) {
          this.logger.warn(
            `Transaction ${transactionId} was already transitioned from ${oldStatus}; skipping failure side effects`,
          );
          return transaction;
        }

        if (transaction.type === TransactionType.WITHDRAW) {
          await this.applyTransitionBalanceEffects(
            transaction,
            TransactionStatus.FAILED,
          );
        }

        if (isExpiredNotFound && oldStatus === TransactionStatus.PENDING) {
          await this.ledgerService.reverse(transaction);
        }

        this.logger.warn(`Transaction verification failed: ${transactionId}`);
      } else {
        this.logger.log(`Transaction still pending: ${transactionId}`);
        return transaction;
      }

      await this.transactionRepository.save(transaction);

      if (transaction.status === TransactionStatus.SUCCESS) {
        this.taxQueue
          .add('process-transaction', { transactionId: transaction.id })
          .catch((e) =>
            this.logger.error(
              `Failed to enqueue tax processing for verified transaction ${transaction.id}: ${e.message}`,
            ),
          );

        // Async micro-savings evaluation — never blocks the originating transaction
        if (transaction.type === TransactionType.WITHDRAW) {
          this.microSavingsService
            .evaluatePerTransaction(
              transaction.userId,
              transaction.id,
              parseFloat(transaction.amount),
              transaction.currency,
            )
            .catch((e) =>
              this.logger.error(
                `Micro-savings per-transaction eval failed: ${e.message}`,
              ),
            );
          this.microSavingsService
            .evaluateBalanceThreshold(transaction.userId, transaction.currency)
            .catch((e) =>
              this.logger.error(
                `Micro-savings balance-threshold eval failed: ${e.message}`,
              ),
            );
        }
      }

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

        this.amlService
          .enqueue(transaction.id)
          .catch((e) => this.logger.error(`AML enqueue failed: ${e.message}`));
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

    // Reject illegal changes (e.g. SUCCESS to PENDING, FAILED to SUCCESS) with
    // 409, then apply a legal one atomically together with its balance and
    // ledger effects. The claim is conditional, so a concurrent verify, cancel
    // or second admin request can never apply the effects twice.
    await this.applyPendingTransition(transaction, status, {
      failureReason: reason || undefined,
    });

    if (transaction.status === TransactionStatus.SUCCESS) {
      await this.activityFeedService.append(
        transaction.userId,
        ActivityFeedType.TRANSACTION_COMPLETE,
        transaction.id,
        'Transaction',
      );
      this.taxQueue
        .add('process-transaction', { transactionId: transaction.id })
        .catch((e) =>
          this.logger.error(
            `Failed to enqueue tax processing for manual status update ${transaction.id}: ${e.message}`,
          ),
        );
    }

    await this.auditLogsService.logTransactionEvent(
      transaction.userId,
      AuditAction.TRANSACTION_STATUS_UPDATED,
      transaction.id,
      {
        oldStatus,
        newStatus: status,
        updatedBy: adminId,
        reason,
        adminOverride: true,
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

    if (status === TransactionStatus.SUCCESS) {
      this.amlService
        .enqueue(transaction.id)
        .catch((e) => this.logger.error(`AML enqueue failed: ${e.message}`));
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
      throw new ConflictException(
        `Cannot cancel transaction with status ${transaction.status}. Only PENDING transactions can be cancelled.`,
      );
    }

    if (transaction.txHash) {
      throw new ConflictException(
        'This transaction has already been submitted to the Stellar network and can no longer be cancelled.',
      );
    }

    const oldStatus = transaction.status;
    // requireNoTxHash makes the claim itself refuse a transaction that got
    // submitted between the read above and the write.
    await this.applyPendingTransition(
      transaction,
      TransactionStatus.CANCELLED,
      { requireNoTxHash: true },
    );

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
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.max(1, query?.limit ?? 20);

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId });

    if (query?.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: query.type });
    }

    if (query?.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: query.status,
      });
    }

    if (query?.currency) {
      queryBuilder.andWhere('transaction.currency = :currency', {
        currency: query.currency,
      });
    }

    // Filter by tag — array contains (GIN-indexed)
    if (query?.tag) {
      queryBuilder.andWhere(':tag = ANY(transaction.tags)', {
        tag: query.tag.toLowerCase(),
      });
    }

    // Full-text search across userNote, counterpartyMemo, txHash
    if (query?.search) {
      const term = `%${query.search}%`;
      queryBuilder.andWhere(
        '(transaction.userNote ILIKE :term OR transaction.counterpartyMemo ILIKE :term OR transaction.txHash ILIKE :term)',
        { term },
      );
    }

    queryBuilder
      .orderBy('transaction.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

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
      const allCurrencies = await this.currenciesService.findAll(false);
      const currencyMap = new Map(
        allCurrencies.map((c) => [c.code.toUpperCase(), c]),
      );
      for (const currencyCode of uniqueCurrencies) {
        const currency = currencyMap.get(currencyCode.toUpperCase());
        if (currency) {
          currencyLookup[currencyCode] = {
            symbol: currency.symbol || currencyCode,
            displayName: currency.name || currencyCode,
          };
        } else {
          currencyLookup[currencyCode] = {
            symbol: currencyCode,
            displayName: currencyCode,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch currency metadata: ${error instanceof Error ? error.message : String(error)}`,
      );
      for (const currencyCode of uniqueCurrencies) {
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
   * Get a bounded, oldest-first batch of pending transactions that need verification.
   */
  async getPendingTransactions(limit = 100): Promise<Transaction[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);

    return this.transactionRepository.find({
      where: { status: TransactionStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: safeLimit,
    });
  }

  /**
   * Update the private note on a transaction (owner only).
   */
  async updateNote(
    transactionId: string,
    userId: string,
    note: string | null,
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.userId !== userId)
      throw new ForbiddenException(
        'You do not have permission to annotate this transaction',
      );
    transaction.userNote = note;
    return this.transactionRepository.save(transaction);
  }

  /**
   * Replace the tag list on a transaction (owner only).
   */
  async updateTags(
    transactionId: string,
    userId: string,
    tags: string[],
  ): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.userId !== userId)
      throw new ForbiddenException(
        'You do not have permission to annotate this transaction',
      );
    transaction.tags = tags;
    return this.transactionRepository.save(transaction);
  }

  /**
   * Return all unique tags used by the authenticated user with usage counts.
   */
  async getUserTags(userId: string): Promise<TagUsageDto[]> {
    // Unnest the text[] array and count occurrences per tag
    const rows = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('UNNEST(transaction.tags)', 'tag')
      .addSelect('COUNT(*)', 'count')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.tags IS NOT NULL')
      .groupBy('tag')
      .orderBy('count', 'DESC')
      .getRawMany<{ tag: string; count: string }>();

    return rows.map((r) => ({ tag: r.tag, count: parseInt(r.count, 10) }));
  }

  // ── Category auto-assignment ───────────────────────────────────────────────

  private async autoAssignCategory(transaction: Transaction): Promise<void> {
    try {
      let categoryName: string;

      switch (transaction.type) {
        case TransactionType.SWAP:
          categoryName = 'Exchange';
          break;
        case TransactionType.WITHDRAW:
          categoryName = 'Transfers';
          break;
        case TransactionType.DEPOSIT: {
          const meta = transaction.metadata;
          if (meta?.source === 'referral') {
            categoryName = 'Referral Rewards';
          } else if (meta?.source === 'savings') {
            categoryName = 'Savings';
          } else if (meta?.source === 'batch' || meta?.batchPayment) {
            categoryName = 'Payroll';
          } else {
            categoryName = 'Transfers';
          }
          break;
        }
        default:
          categoryName = 'Other';
      }

      const category = await this.categoryRepository.findOne({
        where: { name: categoryName, isSystem: true },
      });

      if (category) {
        transaction.categoryId = category.id;
        await this.transactionRepository.save(transaction);
      }
    } catch (err) {
      this.logger.warn(
        `Category auto-assignment failed for transaction ${transaction.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Reject any status change the state machine does not allow with a 409.
   */
  private assertTransitionAllowed(
    from: TransactionStatus,
    to: TransactionStatus,
  ): void {
    if (!ALLOWED_STATUS_TRANSITIONS[from]?.includes(to)) {
      throw new ConflictException(
        `Illegal status transition ${from} to ${to}. Only PENDING transactions can move to SUCCESS, FAILED or CANCELLED.`,
      );
    }
  }

  /**
   * A withdrawal or swap that has no hash yet and is younger than the Stellar
   * time bound may still be inside the request that created it. Its funds are
   * reserved and the send can still happen, so refunding or settling it now
   * would let the same money be spent twice.
   */
  private assertNotInFlight(transaction: Transaction): void {
    const sendsFunds =
      transaction.type === TransactionType.WITHDRAW ||
      transaction.type === TransactionType.SWAP;
    if (!sendsFunds || transaction.txHash) {
      return;
    }

    const createdAt = new Date(transaction.createdAt).getTime();
    const ageMs = Date.now() - createdAt;
    if (
      Number.isFinite(createdAt) &&
      ageMs < STELLAR_TRANSACTION_TIME_BOUND_MS + NOT_FOUND_GRACE_MARGIN_MS
    ) {
      throw new ConflictException(
        'Transaction is still being processed. Try again once it has been submitted or has expired.',
      );
    }
  }

  /**
   * Move a PENDING transaction to a terminal status together with its balance
   * and ledger effects, all in one database transaction.
   *
   * The status change is a conditional UPDATE (WHERE status = PENDING, plus
   * txHash IS NULL when requireNoTxHash is set). Only the request that wins it
   * applies the effects, so repeated, concurrent or racing callers cannot
   * credit, refund or reverse twice. If anything fails, everything rolls back.
   */
  private async applyPendingTransition(
    transaction: Transaction,
    target: TransactionStatus,
    options: { failureReason?: string; requireNoTxHash?: boolean } = {},
  ): Promise<void> {
    this.assertTransitionAllowed(transaction.status, target);
    this.assertNotInFlight(transaction);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const claimed = await queryRunner.manager.update(
        Transaction,
        {
          id: transaction.id,
          status: TransactionStatus.PENDING,
          ...(options.requireNoTxHash ? { txHash: IsNull() } : {}),
        },
        {
          status: target,
          ...(options.failureReason !== undefined
            ? { failureReason: options.failureReason }
            : {}),
        },
      );

      if ((claimed.affected ?? 0) !== 1) {
        throw new ConflictException(
          'Transaction was changed by another request and can no longer be updated',
        );
      }

      await this.applyTransitionBalanceEffects(
        transaction,
        target,
        queryRunner.manager,
      );

      if (target !== TransactionStatus.SUCCESS) {
        await this.ledgerService.reverse(transaction, queryRunner);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    transaction.status = target;
    if (options.failureReason !== undefined) {
      transaction.failureReason = options.failureReason;
    }
  }

  /**
   * Balance effects of a transaction settling. verifyTransaction and the
   * manual transition path both use this, so a verified and a forced status
   * change always move the same money.
   *
   * SUCCESS of a DEPOSIT credits the amount net of a same-currency fee (a fee
   * in another currency is debited separately). FAILED or CANCELLED of a
   * WITHDRAW gives back the amount and fee that were reserved, and of a SWAP
   * the reserved amount plus fee in the source currency.
   */
  private async applyTransitionBalanceEffects(
    transaction: Transaction,
    target: TransactionStatus,
    manager?: EntityManager,
  ): Promise<void> {
    const { feeAmount, feeCurrency, sameCurrencyFee } =
      this.getFeeBreakdown(transaction);
    const adjust = (currency: string, amount: Decimal.Value) =>
      manager
        ? this.updateUserBalance(transaction.userId, currency, amount, manager)
        : this.updateUserBalance(transaction.userId, currency, amount);

    if (
      target === TransactionStatus.SUCCESS &&
      transaction.type === TransactionType.DEPOSIT
    ) {
      await adjust(
        transaction.currency,
        toDecimal(transaction.amount).minus(sameCurrencyFee ? feeAmount : 0),
      );
      if (!sameCurrencyFee && feeAmount.gt(0)) {
        await adjust(feeCurrency, feeAmount.neg());
      }
      return;
    }

    if (
      target !== TransactionStatus.FAILED &&
      target !== TransactionStatus.CANCELLED
    ) {
      return;
    }

    if (transaction.type === TransactionType.WITHDRAW) {
      await adjust(
        transaction.currency,
        toDecimal(transaction.amount).plus(sameCurrencyFee ? feeAmount : 0),
      );
      if (!sameCurrencyFee && feeAmount.gt(0)) {
        await adjust(feeCurrency, feeAmount);
      }
    } else if (transaction.type === TransactionType.SWAP) {
      // createSwap reserves amount + fee from the source currency.
      await adjust(
        transaction.currency,
        toDecimal(transaction.amount).plus(feeAmount),
      );
    }
  }

  private getFeeBreakdown(transaction: Transaction): {
    feeAmount: Decimal;
    feeCurrency: string;
    sameCurrencyFee: boolean;
  } {
    const feeAmount = toDecimal(transaction.feeAmount?.toString() ?? '0');
    const feeCurrency = (
      transaction.feeCurrency ?? transaction.currency
    ).toUpperCase();

    return {
      feeAmount,
      feeCurrency,
      sameCurrencyFee: feeCurrency === transaction.currency.toUpperCase(),
    };
  }

  private async runBestEffort(
    action: () => unknown | Promise<unknown>,
    description: string,
  ): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.logger.error(`${description} failed: ${toError(err).message}`);
    }
  }

  private async getUserStellarAddress(
    userId: string,
    walletId?: string,
    allowWatchOnly = false,
  ): Promise<string> {
    const ctx = await this.walletsService.resolveWalletForTransaction(
      userId,
      walletId,
      { allowWatchOnly },
    );
    return ctx.publicKey;
  }

  private async getUserStellarSecretKey(
    userId: string,
    walletId?: string,
  ): Promise<string> {
    const ctx = await this.walletsService.resolveWalletForTransaction(
      userId,
      walletId,
    );
    if (!ctx.encryptedSecretKey) {
      throw new BadRequestException(
        'This wallet is watch-only and cannot sign transactions',
      );
    }
    return this.encryptionService.decrypt(ctx.encryptedSecretKey);
  }

  private async getUserBalance(
    userId: string,
    currency: string,
  ): Promise<string> {
    return this.balanceService.getBalance(userId, currency);
  }

  /**
   * Atomic signed balance adjustment: positive credits, negative debits and
   * throws 'Insufficient balance' when funds are missing. The check and the
   * write are one statement inside BalanceService, never read-modify-write.
   */
  private async updateUserBalance(
    userId: string,
    currency: string,
    amount: Decimal.Value,
    manager?: EntityManager,
  ): Promise<void> {
    this.logger.log(
      `Updating balance for user ${userId}: ${amount.toString()} ${currency}`,
    );

    const newBalance = await this.balanceService.applyDelta(
      userId,
      currency,
      amount,
      manager,
    );

    this.logger.log(
      `Updated user ${userId} balance for ${currency}. New balance: ${newBalance}`,
    );
  }

  /**
   * Debit every movement or none of them: all conditional UPDATEs share one
   * database transaction.
   */
  private async reserveFunds(
    userId: string,
    debits: BalanceMovement[],
  ): Promise<void> {
    await this.withBalanceTransaction(async (manager) => {
      for (const { currency, amount } of debits) {
        await this.balanceService.debit(userId, currency, amount, manager);
      }
    });
  }

  /**
   * Give back funds reserved for a send that never reached the network. A
   * failed refund is logged loudly because the ledger then needs repair.
   */
  private async refundFunds(
    userId: string,
    credits: BalanceMovement[],
    transactionId?: string,
  ): Promise<void> {
    try {
      await this.withBalanceTransaction(async (manager) => {
        for (const { currency, amount } of credits) {
          await this.balanceService.credit(userId, currency, amount, manager);
        }
      });
    } catch (refundError) {
      this.logger.error(
        `CRITICAL: failed to refund reserved funds to user ${userId} for transaction ${transactionId ?? 'n/a'}: ${toError(refundError).message}`,
      );
    }
  }

  private async withBalanceTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
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

      await this.firebaseService.sendToTokens(
        user.fcmTokens,
        title,
        body,
        { transactionId: transaction.id, type: transaction.type },
        {
          notificationId: transaction.id,
          type: transaction.type,
          deepLink: `nexafx://transactions/${transaction.id}`,
          actionType: transaction.type,
          resourceId: transaction.id,
          resourceType: 'transaction',
          timestamp: new Date().toISOString(),
        },
      );
    } catch (e) {
      // Intentionally swallow errors so it doesn't break flows
    }
  }

  private async persistTransactionArtifacts(
    transaction: Transaction,
    fee: CalculatedFee,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedTransaction = await queryRunner.manager.save(
        Transaction,
        transaction,
      );
      Object.assign(transaction, savedTransaction);
      await this.feesService.recordFee(
        transaction.id,
        transaction.userId,
        fee,
        queryRunner.manager,
      );
      await this.ledgerService.record(transaction, queryRunner);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateConfidenceScore(
    transactionId: string,
    scores: {
      confidenceScore: number;
      expectedCompletionSeconds: number;
      confidenceLabel: string;
    },
  ): Promise<void> {
    await this.transactionRepository.update(transactionId, {
      confidenceScore: scores.confidenceScore,
      expectedCompletionSeconds: scores.expectedCompletionSeconds,
      confidenceLabel: scores.confidenceLabel,
    });
  }

  async confirmDeposit(depositId: string): Promise<void> {
    const deposit = await this.transactionRepository.findOne({
      where: { id: depositId },
    });
    if (!deposit || deposit.status === TransactionStatus.SUCCESS) return;

    const claimed = await this.transactionRepository.update(
      { id: depositId, status: TransactionStatus.PENDING },
      { status: TransactionStatus.SUCCESS },
    );
    if ((claimed.affected ?? 0) !== 1) return;

    deposit.status = TransactionStatus.SUCCESS;
    try {
      await this.referralsService.processReferralReward(deposit.userId);
    } catch (error) {
      const referralError = toError(error);
      this.logger.error(
        `Failed to process referral reward for deposit ${depositId}: ${referralError.message}`,
      );
    }
  }
}

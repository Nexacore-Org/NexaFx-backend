import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from 'stellar-sdk';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';

import {
  CreateTransactionParams,
  GenerateWalletResult,
  SendPaymentResult,
  VerifyTransactionResult,
  WalletBalanceResult,
} from './stellar.types';
import {
  TransactionBuildError,
  TransactionSubmissionError,
  WalletGenerationError,
} from './stellar.errors';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';

const DEFAULT_TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
const DEFAULT_TESTNET_FRIENDBOT = 'https://friendbot.stellar.org';
const ESCROW_ACCOUNT_MINIMUM_BALANCE = '1';
const STROOPS_PER_XLM = '10000000';

interface StellarErrorShape {
  message: string;
  status?: number;
  response?: {
    status?: number;
    data?: {
      extras?: {
        result_codes?: string;
      };
    };
  };
}

interface IncomingPaymentSearch {
  address: string;
  amount: string;
  currency: string;
  memo: string;
  createdAfter: Date;
}

interface IncomingPaymentRecord {
  created_at: string;
  from: string;
  to: string;
  amount: string;
  transaction_hash: string;
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}

function isIncomingPaymentRecord(
  value: unknown,
): value is IncomingPaymentRecord {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.created_at === 'string' &&
    typeof record.from === 'string' &&
    typeof record.to === 'string' &&
    typeof record.amount === 'string' &&
    typeof record.transaction_hash === 'string' &&
    typeof record.asset_type === 'string'
  );
}

function toStellarError(error: unknown): StellarErrorShape {
  if (error instanceof Error) {
    return error;
  }
  return { message: String(error) };
}

@Injectable()
export class StellarService {
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly logger = new Logger(StellarService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const horizonUrl =
      this.configService.get<string>('STELLAR_HORIZON_URL') ??
      (nodeEnv === 'production' ? undefined : DEFAULT_TESTNET_HORIZON);
    const network =
      this.configService.get<string>('STELLAR_NETWORK') ??
      (nodeEnv === 'production' ? undefined : 'TESTNET');

    if (!horizonUrl || !network) {
      throw new Error('Stellar environment variables not configured');
    }

    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = Networks[network as keyof typeof Networks];

    if (!this.networkPassphrase) {
      throw new Error(`Unsupported Stellar network: ${network}`);
    }
  }

  /* -------------------- WALLET -------------------- */

  createKeypair(): GenerateWalletResult {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  async generateWallet(
    userId?: string,
    logMetadata?: Record<string, unknown>,
  ): Promise<GenerateWalletResult> {
    try {
      const keypair = this.createKeypair();

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_CREATED,
          userId,
          {
            publicKey: keypair.publicKey,
            keyType: 'stellar',
            ...logMetadata,
          },
          true,
        );

        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_KEY_GENERATED,
          userId,
          {
            keyType: 'stellar_private_key_hash',
            hash: this.hashPrivateKey(keypair.secretKey),
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
          true,
        );
      }

      return keypair;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to generate Stellar wallet: ${error.message}`);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_CREATED + '_FAILED',
          userId,
          {
            error: error.message,
            ...logMetadata,
          },
        );
      }

      throw new WalletGenerationError('Failed to generate Stellar wallet');
    }
  }

  async fundTestnetWallet(publicKey: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv === 'production') {
      this.logger.debug('Skipping Friendbot funding in production');
      return;
    }

    const network = (
      this.configService.get<string>('STELLAR_NETWORK') ?? 'TESTNET'
    ).toUpperCase();
    if (network !== 'TESTNET') {
      this.logger.debug(`Skipping Friendbot funding for network ${network}`);
      return;
    }

    const url = `${DEFAULT_TESTNET_FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Friendbot funding failed (${response.status}): ${response.statusText}`,
      );
    }

    this.logger.log(`Funded testnet wallet via Friendbot: ${publicKey}`);
  }

  async getAccountBalance(publicKey: string): Promise<string> {
    const balances = await this.getWalletBalances(publicKey);
    const xlm = balances.find((b) => b.asset === 'XLM');
    return xlm?.balance ?? '0';
  }

  async getWalletBalances(publicKey: string): Promise<WalletBalanceResult[]> {
    try {
      const account = await this.server.loadAccount(publicKey);

      return account.balances.map((balance: Horizon.HorizonApi.BalanceLine) => {
        if (balance.asset_type === 'native') {
          return {
            asset: 'XLM',
            balance: balance.balance,
          };
        }

        if ('asset_code' in balance) {
          return {
            asset: balance.asset_code || 'UNKNOWN',
            balance: balance.balance,
            assetIssuer:
              'asset_issuer' in balance ? balance.asset_issuer : undefined,
          };
        }

        return {
          asset: 'LIQUIDITY_POOL',
          balance: balance.balance,
        };
      });
    } catch (err: unknown) {
      const error = toStellarError(err);
      const statusCode = error.response?.status ?? error.status;

      if (statusCode === 404) {
        this.logger.warn(
          `Stellar account not funded/activated yet: ${publicKey}`,
        );
        return [];
      }

      this.logger.error(
        `Failed to load Stellar balances for ${publicKey}: ${error.message}`,
      );
      throw new TransactionBuildError(
        'Failed to fetch Stellar wallet balances',
      );
    }
  }

  /* -------------------- PAYMENTS -------------------- */

  async sendPayment(
    fromSecretOrParams:
      | string
      | {
          sourcePublicKey?: string;
          destination: string;
          asset?: string | Asset;
          amount: string;
          secretKey: string;
          memo?: string;
          memoType?: string;
          userId?: string;
        },
    toPublicKey?: string,
    amount?: string,
    memo?: string,
    userId?: string,
  ): Promise<SendPaymentResult> {
    let fromSecret: string;
    let destPublicKey: string;
    let paymentAmount: string;
    let paymentAsset: string | Asset | undefined;
    let paymentMemo: string | undefined = memo;
    let paymentUserId: string | undefined = userId;

    if (typeof fromSecretOrParams === 'object') {
      fromSecret = fromSecretOrParams.secretKey;
      destPublicKey = fromSecretOrParams.destination;
      paymentAmount = fromSecretOrParams.amount;
      paymentAsset = fromSecretOrParams.asset;
      paymentMemo = fromSecretOrParams.memo;
      paymentUserId = fromSecretOrParams.userId;
    } else {
      fromSecret = fromSecretOrParams;
      destPublicKey = toPublicKey!;
      paymentAmount = amount!;
    }

    try {
      const keypair = Keypair.fromSecret(fromSecret);
      const account = await this.server.loadAccount(keypair.publicKey());

      const builder = new TransactionBuilder(account, {
        fee: this.configService.get<string>('STELLAR_BASE_FEE') || BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      }).addOperation(
        Operation.payment({
          destination: destPublicKey,
          asset: this.resolvePaymentAsset(paymentAsset),
          amount: paymentAmount,
        }),
      );

      if (paymentMemo) {
        builder.addMemo(Memo.text(paymentMemo));
      }

      const transaction = builder.setTimeout(180).build();
      transaction.sign(keypair);

      const result = await this.server.submitTransaction(transaction);

      if (paymentUserId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED,
          paymentUserId,
          {
            transactionHash: result.hash,
            ledger: result.ledger,
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
        );
      }

      return {
        hash: result.hash,
        ledger: result.ledger,
      };
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to send Stellar payment: ${error.message}`);

      if (paymentUserId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED + '_FAILED',
          paymentUserId,
          {
            destination: destPublicKey,
            amount: paymentAmount,
            error: error.message,
            resultCodes: error.response?.data?.extras?.result_codes,
          },
        );
      }

      throw new TransactionSubmissionError(
        error.response?.data?.extras?.result_codes ??
          'Stellar payment submission failed',
      );
    }
  }

  async createEscrowAccount(params: {
    destination: string;
    amount: string;
    secretKey: string;
    memo?: string;
    userId?: string;
  }): Promise<SendPaymentResult> {
    const { destination, amount, secretKey, memo, userId } = params;
    const keypair = Keypair.fromSecret(secretKey);
    const baseFee =
      this.configService.get<string>('STELLAR_BASE_FEE') || BASE_FEE;
    const closureFees = new Decimal(baseFee).mul(2).div(STROOPS_PER_XLM);
    const startingBalance = new Decimal(amount)
      .plus(ESCROW_ACCOUNT_MINIMUM_BALANCE)
      .plus(closureFees)
      .toFixed(7);

    try {
      const account = await this.server.loadAccount(keypair.publicKey());
      const builder = new TransactionBuilder(account, {
        fee: baseFee,
        networkPassphrase: this.networkPassphrase,
      }).addOperation(
        Operation.createAccount({
          destination,
          startingBalance,
        }),
      );

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.setTimeout(180).build();
      transaction.sign(keypair);
      const result = await this.server.submitTransaction(transaction);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED,
          userId,
          {
            transactionHash: result.hash,
            ledger: result.ledger,
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
        );
      }

      return { hash: result.hash, ledger: result.ledger };
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to create Stellar escrow account: ${error.message}`);
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED + '_FAILED',
          userId,
          {
            destination,
            amount: startingBalance,
            error: error.message,
            resultCodes: error.response?.data?.extras?.result_codes,
          },
        );
      }
      throw new TransactionSubmissionError(
        error.response?.data?.extras?.result_codes ??
          'Stellar escrow account creation failed',
      );
    }
  }

  async closeEscrowAccount(params: {
    destination: string;
    reserveDestination: string;
    amount: string;
    secretKey: string;
    memo?: string;
    userId?: string;
  }): Promise<SendPaymentResult> {
    const {
      destination,
      reserveDestination,
      amount,
      secretKey,
      memo,
      userId,
    } = params;
    const keypair = Keypair.fromSecret(secretKey);
    const baseFee =
      this.configService.get<string>('STELLAR_BASE_FEE') || BASE_FEE;

    try {
      const account = await this.server.loadAccount(keypair.publicKey());
      const builder = new TransactionBuilder(account, {
        fee: baseFee,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination,
            asset: Asset.native(),
            amount,
          }),
        )
        .addOperation(Operation.accountMerge({ destination: reserveDestination }));

      if (memo) {
        builder.addMemo(Memo.text(memo));
      }

      const transaction = builder.setTimeout(180).build();
      transaction.sign(keypair);
      const result = await this.server.submitTransaction(transaction);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED,
          userId,
          {
            transactionHash: result.hash,
            ledger: result.ledger,
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
        );
      }

      return { hash: result.hash, ledger: result.ledger };
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to close Stellar escrow account: ${error.message}`);
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED + '_FAILED',
          userId,
          {
            destination,
            reserveDestination,
            amount,
            error: error.message,
            resultCodes: error.response?.data?.extras?.result_codes,
          },
        );
      }
      throw new TransactionSubmissionError(
        error.response?.data?.extras?.result_codes ??
          'Stellar escrow account closure failed',
      );
    }
  }

  private resolvePaymentAsset(asset?: string | Asset): Asset {
    if (!asset) {
      return Asset.native();
    }
    if (asset instanceof Asset) {
      return asset;
    }
    if (asset.toUpperCase() === 'XLM') {
      return Asset.native();
    }

    const separator = asset.indexOf(':');
    if (separator <= 0 || separator === asset.length - 1) {
      throw new Error(
        'Issued Stellar assets must be specified as CODE:ISSUER',
      );
    }
    return new Asset(asset.slice(0, separator), asset.slice(separator + 1));
  }

  listenForPayments(
    publicKey: string,
    callback: (payment: Record<string, unknown>) => void,
  ): () => void {
    const closeStream = this.server
      .payments()
      .forAccount(publicKey)
      .cursor('now')
      .stream({
        onmessage: (payment) => {
          callback(payment as unknown as Record<string, unknown>);
        },
        onerror: (streamError) => {
          this.logger.error(
            `Stellar payment stream error for ${publicKey}: ${String(streamError)}`,
          );
        },
      });

    return () => {
      closeStream();
    };
  }

  async findIncomingPayment(
    search: IncomingPaymentSearch,
  ): Promise<{ hash: string } | null> {
    const expectedAsset = this.getAssetWithDefaultIssuer(
      search.currency.toUpperCase(),
    );
    let page = await this.server
      .payments()
      .forAccount(search.address)
      .order('desc')
      .limit(200)
      .call();

    while (page.records.length > 0) {
      for (const record of page.records) {
        if (!isIncomingPaymentRecord(record)) continue;

        const paymentCreatedAt = Date.parse(record.created_at);
        if (
          !Number.isFinite(paymentCreatedAt) ||
          paymentCreatedAt < search.createdAfter.getTime()
        ) {
          continue;
        }

        if (
          record.from === search.address ||
          record.to !== search.address ||
          !new Decimal(record.amount).equals(search.amount)
        ) {
          continue;
        }

        const assetMatches = expectedAsset.isNative()
          ? record.asset_type === 'native'
          : record.asset_type !== 'native' &&
            record.asset_code === expectedAsset.getCode() &&
            record.asset_issuer === expectedAsset.getIssuer();
        if (!assetMatches) continue;

        const transaction = await this.server
          .transactions()
          .transaction(record.transaction_hash)
          .call();

        if (
          transaction.successful &&
          transaction.memo_type === 'text' &&
          transaction.memo === search.memo
        ) {
          return { hash: record.transaction_hash };
        }
      }

      const oldestRecord = page.records[page.records.length - 1];
      if (
        page.records.length < 200 ||
        (isIncomingPaymentRecord(oldestRecord) &&
          Date.parse(oldestRecord.created_at) <
            search.createdAfter.getTime())
      ) {
        return null;
      }

      page = await page.next();
    }

    return null;
  }

  /* -------------------- TRANSACTION -------------------- */

  async createTransaction(
    params: CreateTransactionParams,
  ): Promise<Transaction> {
    try {
      const account = await this.server.loadAccount(params.sourcePublicKey);

      const builder = new TransactionBuilder(account, {
        fee: this.configService.get<string>('STELLAR_BASE_FEE') || BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const operation of params.operations) {
        builder.addOperation(
          operation as Parameters<TransactionBuilder['addOperation']>[0],
        );
      }

      if (params.memo) {
        builder.addMemo(Memo.text(params.memo));
      }

      const transaction = builder.setTimeout(180).build();

      if (params.userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_CREATED,
          params.userId,
          {
            sourcePublicKey: params.sourcePublicKey,
            operationsCount: params.operations.length,
            memo: params.memo,
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
        );
      }

      return transaction;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(
        `Failed to build Stellar transaction: ${error.message}`,
      );

      if (params.userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_CREATED_FAILED,
          params.userId,
          {
            sourcePublicKey: params.sourcePublicKey,
            error: error.message,
          },
        );
      }

      throw new TransactionBuildError('Failed to build Stellar transaction');
    }
  }

  async signTransaction(
    transaction: Transaction,
    secretKey: string,
    userId?: string,
  ): Promise<Transaction> {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      transaction.sign(keypair);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SIGNED,
          userId,
          {
            transactionHash: this.hashTransaction(transaction),
            publicKey: keypair.publicKey(),
            keyHash: this.hashPrivateKey(secretKey.substring(0, 10)),
          },
          true,
        );
      }

      return transaction;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to sign Stellar transaction: ${error.message}`);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SIGNED + '_FAILED',
          userId,
          { error: error.message },
          true,
        );
      }

      throw new TransactionBuildError('Failed to sign Stellar transaction');
    }
  }

  async submitTransaction(transaction: Transaction, userId?: string) {
    try {
      const result = await this.server.submitTransaction(transaction);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED,
          userId,
          {
            transactionHash: transaction.hash().toString('hex'),
            ledger: result.ledger,
            network: this.configService.get<string>('STELLAR_NETWORK'),
          },
        );
      }

      return result;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(
        `Failed to submit Stellar transaction: ${error.message}`,
      );

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED + '_FAILED',
          userId,
          {
            transactionHash: transaction.hash().toString('hex'),
            error: error.message,
            resultCodes: error.response?.data?.extras?.result_codes,
          },
        );
      }

      throw new TransactionSubmissionError(
        error.response?.data?.extras?.result_codes ??
          'Transaction submission failed',
      );
    }
  }

  async verifyTransaction(
    txHash: string,
    userId?: string,
  ): Promise<VerifyTransactionResult> {
    try {
      const tx = await this.server.transactions().transaction(txHash).call();

      const result: VerifyTransactionResult = {
        status: tx.successful ? 'SUCCESS' : 'FAILED',
        details: tx,
      };

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_VERIFIED,
          userId,
          {
            transactionHash: txHash,
            status: result.status,
            ledger: tx.ledger,
            createdAt: tx.created_at,
          },
        );
      }

      return result;
    } catch (err: unknown) {
      const error = toStellarError(err);

      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_VERIFIED,
          userId,
          {
            transactionHash: txHash,
            status: 'PENDING',
            error: error.message,
          },
        );
      }

      return { status: 'PENDING' };
    }
  }

  /* -------------------- PATH FINDING -------------------- */

  getAsset(code: string, issuer?: string): Asset {
    if (code === 'XLM' || !issuer) {
      return Asset.native();
    }

    return new Asset(code, issuer);
  }

  getAssetWithDefaultIssuer(code: string): Asset {
    if (code === 'XLM') {
      return Asset.native();
    }

    return new Asset(
      code,
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335XPB7X3NCQXMK3SBEG3CIFE7G',
    );
  }

  async findBestPath(
    sourceAsset: Asset,
    destAsset: Asset,
    amount: string,
    mode: 'strict-send' | 'strict-receive',
  ): Promise<Horizon.ServerApi.PaymentPathRecord[]> {
    try {
      let paths: Horizon.ServerApi.PaymentPathRecord[];

      if (mode === 'strict-send') {
        const response = await this.server
          .strictSendPaths(sourceAsset, amount, [destAsset])
          .call();
        paths = response.records;
        paths.sort(
          (a, b) =>
            parseFloat(b.destination_amount) - parseFloat(a.destination_amount),
        );
      } else {
        const response = await this.server
          .strictReceivePaths([sourceAsset], destAsset, amount)
          .call();
        paths = response.records;
        paths.sort(
          (a, b) => parseFloat(a.source_amount) - parseFloat(b.source_amount),
        );
      }

      return paths;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Failed to find best path: ${error.message}`);
      return [];
    }
  }

  buildPathPaymentOp(params: {
    sendAsset: Asset;
    sendAmount?: string;
    destAsset: Asset;
    destAmount?: string;
    destination: string;
    path: Asset[];
    mode: 'strict-send' | 'strict-receive';
    slippageTolerance?: number;
  }) {
    const slippage = params.slippageTolerance ?? 0.005;

    if (params.mode === 'strict-send') {
      if (!params.sendAmount) {
        throw new Error('sendAmount is required for strict-send');
      }

      const destAmount = parseFloat(params.destAmount ?? '0');
      const destMin = (destAmount * (1 - slippage)).toFixed(7);

      return Operation.pathPaymentStrictSend({
        sendAsset: params.sendAsset,
        sendAmount: params.sendAmount,
        destination: params.destination,
        destAsset: params.destAsset,
        destMin,
        path: params.path,
      });
    }

    if (!params.destAmount) {
      throw new Error('destAmount is required for strict-receive');
    }

    const sendAmount = parseFloat(params.sendAmount ?? '0');
    const sendMax = (sendAmount * (1 + slippage)).toFixed(7);

    return Operation.pathPaymentStrictReceive({
      sendAsset: params.sendAsset,
      sendMax,
      destination: params.destination,
      destAsset: params.destAsset,
      destAmount: params.destAmount,
      path: params.path,
    });
  }

  /* -------------------- HEALTH -------------------- */

  async checkConnectivity(): Promise<boolean> {
    try {
      await this.server.feeStats();
      return true;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Stellar connectivity check failed: ${error.message}`);
      return false;
    }
  }

  async getNetworkFeeStats(): Promise<Horizon.HorizonApi.FeeStatsResponse> {
    return this.server.feeStats();
  }

  async getLatestLedger(): Promise<Horizon.ServerApi.LedgerRecord | null> {
    try {
      const response = await this.server
        .ledgers()
        .order('desc')
        .limit(1)
        .call();
      return response.records?.[0] ?? null;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.warn(`Failed to fetch latest ledger: ${error.message}`);
      return null;
    }
  }

  /* -------------------- HELPERS -------------------- */

  private hashPrivateKey(privateKey: string): string {
    return crypto
      .createHash('sha256')
      .update(privateKey)
      .digest('hex')
      .substring(0, 16);
  }

  private hashTransaction(transaction: Transaction): string {
    const hash = transaction.hash().toString('hex');
    return hash.substring(0, 16) + '...' + hash.substring(hash.length - 8);
  }

  async generateWalletWithLogging(
    userId: string,
    metadata?: Record<string, unknown>,
  ): Promise<GenerateWalletResult> {
    return this.generateWallet(userId, metadata);
  }
}

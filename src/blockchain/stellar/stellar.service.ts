import { Injectable, Logger } from '@nestjs/common';
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Networks,
  Transaction,
} from 'stellar-sdk';
import * as crypto from 'crypto';

import {
  CreateTransactionParams,
  GenerateWalletResult,
  VerifyTransactionResult,
  WalletBalanceResult,
} from './stellar.types';

import {
  WalletGenerationError,
  TransactionBuildError,
  TransactionSubmissionError,
} from './stellar.errors';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';

interface StellarError {
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

function toStellarError(error: unknown): StellarError {
  if (error instanceof Error) {
    return error as StellarError;
  }
  return { message: String(error) };
}

@Injectable()
export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private readonly logger = new Logger(StellarService.name);

  constructor(private readonly auditLogsService: AuditLogsService) {
    const horizonUrl = process.env.STELLAR_HORIZON_URL;
    const network = process.env.STELLAR_NETWORK;

    if (!horizonUrl || !network) {
      throw new Error('Stellar environment variables not configured');
    }

    this.server = new Horizon.Server(horizonUrl);
    this.networkPassphrase = Networks[network as keyof typeof Networks];

    if (!this.networkPassphrase) {
      throw new Error(`Unsupported Stellar network: ${network}`);
    }
  }

  /* -------------------- HEALTH CHECK -------------------- */

  async checkConnectivity(): Promise<boolean> {
    try {
      await this.server.feeStats();

      await this.auditLogsService.logSystemEvent(
        AuditAction.SYSTEM_CHECK,
        undefined,
        {
          service: 'stellar',
          status: 'connected',
          horizonUrl: process.env.STELLAR_HORIZON_URL,
          network: process.env.STELLAR_NETWORK,
        },
      );

      return true;
    } catch (err: unknown) {
      const error = toStellarError(err);
      this.logger.error(`Stellar connectivity check failed: ${error.message}`);

      await this.auditLogsService.logSystemEvent(
        AuditAction.SYSTEM_CHECK,
        undefined,
        {
          service: 'stellar',
          status: 'disconnected',
          error: error.message,
          horizonUrl: process.env.STELLAR_HORIZON_URL,
        },
      );

      return false;
    }
  }

  /* -------------------- WALLET -------------------- */

  async generateWallet(
    userId?: string,
    logMetadata?: Record<string, unknown>,
  ): Promise<GenerateWalletResult> {
    try {
      const keypair = Keypair.random();

      if (userId) {
        const metadata = {
          publicKey: keypair.publicKey(),
          keyType: 'stellar',
          ...logMetadata,
        };

        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_CREATED,
          userId,
          metadata,
          true,
        );

        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_KEY_GENERATED,
          userId,
          {
            keyType: 'stellar_private_key_hash',
            hash: this.hashPrivateKey(keypair.secret()),
            network: process.env.STELLAR_NETWORK,
          },
          true,
        );
      }

      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
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

  async getWalletBalances(publicKey: string): Promise<WalletBalanceResult[]> {
    try {
      const account = await this.server.loadAccount(publicKey);

      return account.balances.map((balance) => {
        if (balance.asset_type === 'native') {
          return {
            asset: 'XLM',
            balance: balance.balance,
          };
        }

        return {
          asset: balance.asset_code || 'UNKNOWN',
          balance: balance.balance,
          assetIssuer: balance.asset_issuer,
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

  /* -------------------- TRANSACTION -------------------- */

  async createTransaction(
    params: CreateTransactionParams,
  ): Promise<Transaction> {
    try {
      const account = await this.server.loadAccount(params.sourcePublicKey);

      const builder = new TransactionBuilder(account, {
        fee: process.env.STELLAR_BASE_FEE || BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const operation of params.operations) {
        builder.addOperation(operation);
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
            memoType: params.memoType,
            network: process.env.STELLAR_NETWORK,
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
            network: process.env.STELLAR_NETWORK,
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
            network: process.env.STELLAR_NETWORK,
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
            network: process.env.STELLAR_NETWORK,
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
            network: process.env.STELLAR_NETWORK,
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
            network: process.env.STELLAR_NETWORK,
          },
        );
      }

      return { status: 'PENDING' };
    }
  }

  /* -------------------- HELPER METHODS -------------------- */

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

  /* -------------------- WRAPPER METHODS -------------------- */

  async generateWalletWithLogging(
    userId: string,
    metadata?: Record<string, unknown>,
  ): Promise<GenerateWalletResult> {
    return this.generateWallet(userId, metadata);
  }

  async logWalletGeneration(
    userId: string,
    publicKey: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogsService.logSystemEvent(
      AuditAction.WALLET_CREATED,
      userId,
      {
        publicKey,
        keyType: 'stellar',
        network: process.env.STELLAR_NETWORK,
        ...metadata,
      },
      true,
    );
  }

  async logTransactionEvent(
    userId: string,
    action: string,
    transactionHash: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogsService.logSystemEvent(action, userId, {
      transactionHash,
      network: process.env.STELLAR_NETWORK,
      ...metadata,
    });
  }
}

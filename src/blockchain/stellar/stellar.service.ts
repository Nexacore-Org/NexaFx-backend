import { Injectable, Logger } from '@nestjs/common';
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Memo,
  Networks,
  Transaction,
} from 'stellar-sdk';

import {
  CreateTransactionParams,
  GenerateWalletResult,
  VerifyTransactionResult,
} from './stellar.types';

import {
  WalletGenerationError,
  TransactionBuildError,
  TransactionSubmissionError,
} from './stellar.errors';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';

@Injectable()
export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private readonly logger = new Logger(StellarService.name);

  constructor(
    private readonly auditLogsService: AuditLogsService,
  ) {
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
      // Fetches fee stats from Horizon server (lightweight check)
      await this.server.feeStats();

      // Log successful connectivity check
      await this.auditLogsService.logSystemEvent(
        AuditAction.SYSTEM_CHECK,
        undefined,
        {
          service: 'stellar',
          status: 'connected',
          horizonUrl: process.env.STELLAR_HORIZON_URL,
          network: process.env.STELLAR_NETWORK,
        }
      );

      return true;
    } catch (error: any) {
      this.logger.error(`Stellar connectivity check failed: ${error.message}`);

      // Log connectivity failure
      await this.auditLogsService.logSystemEvent(
        AuditAction.SYSTEM_CHECK,
        undefined,
        {
          service: 'stellar',
          status: 'disconnected',
          error: error.message,
          horizonUrl: process.env.STELLAR_HORIZON_URL,
        }
      );

      return false;
    }
  }

  /* -------------------- WALLET -------------------- */

  async generateWallet(
    userId?: string,
    logMetadata?: Record<string, any>,
  ): Promise<GenerateWalletResult> {
    try {
      const keypair = Keypair.random();

      // Log wallet generation (mark as sensitive if it contains secrets)
      if (userId) {
        const metadata = {
          publicKey: keypair.publicKey(),
          keyType: 'stellar',
          ...logMetadata,
        };

        // Log without exposing secret key
        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_CREATED,
          userId,
          metadata,
          true // Mark as sensitive (contains public key but generated along with private)
        );

        // Additional log for key generation (very sensitive - hash only)
        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_KEY_GENERATED,
          userId,
          {
            keyType: 'stellar_private_key_hash',
            hash: this.hashPrivateKey(keypair.secret()),
            network: process.env.STELLAR_NETWORK,
          },
          true // Mark as highly sensitive
        );
      }

      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate Stellar wallet: ${error.message}`);

      // Log wallet generation failure
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.WALLET_CREATED + '_FAILED',
          userId,
          {
            error: error.message,
            ...logMetadata,
          }
        );
      }

      throw new WalletGenerationError('Failed to generate Stellar wallet');
    }
  }

  /* -------------------- TRANSACTION -------------------- */

  async createTransaction(params: CreateTransactionParams): Promise<Transaction> {
    try {
      const account = await this.server.loadAccount(
        params.sourcePublicKey,
      );

      const builder = new TransactionBuilder(account, {
        fee: process.env.STELLAR_BASE_FEE || BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const operation of params.operations) {
        builder.addOperation(operation);
      }

      if (params.memo) {
        builder.addMemo(Memo.text(params.memo));
      }

      const transaction = builder.setTimeout(180).build();

      // Log transaction creation (without sensitive signing data)
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
          }
        );
      }

      return transaction;
    } catch (error: any) {
      this.logger.error(`Failed to build Stellar transaction: ${error.message}`);

      // Log transaction build failure
      if (params.userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_CREATED_FAILED,
          params.userId,
          {
            sourcePublicKey: params.sourcePublicKey,
            error: error.message,
            network: process.env.STELLAR_NETWORK,
          }
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

      // Log transaction signing (highly sensitive - hash only)
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SIGNED,
          userId,
          {
            transactionHash: this.hashTransaction(transaction),
            publicKey: keypair.publicKey(),
            keyHash: this.hashPrivateKey(secretKey.substring(0, 10)), // Partial hash for identification
          },
          true // Mark as sensitive
        );
      }

      return transaction;
    } catch (error: any) {
      this.logger.error(`Failed to sign Stellar transaction: ${error.message}`);

      // Log signing failure
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SIGNED + '_FAILED',
          userId,
          {
            error: error.message,
          },
          true
        );
      }

      throw new TransactionBuildError('Failed to sign Stellar transaction');
    }
  }

  async submitTransaction(
    transaction: Transaction,
    userId?: string,
  ) {
    try {
      const result = await this.server.submitTransaction(transaction);

      // Log successful transaction submission
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED,
          userId,
          {
            transactionHash: transaction.hash().toString('hex'),
            ledger: result.ledger,
            network: process.env.STELLAR_NETWORK,
          }
        );
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Failed to submit Stellar transaction: ${error.message}`);

      // Log submission failure
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_SUBMITTED + '_FAILED',
          userId,
          {
            transactionHash: transaction.hash().toString('hex'),
            error: error.message,
            resultCodes: error?.response?.data?.extras?.result_codes,
            network: process.env.STELLAR_NETWORK,
          }
        );
      }

      throw new TransactionSubmissionError(
        error?.response?.data?.extras?.result_codes ||
          'Transaction submission failed',
      );
    }
  }

  async verifyTransaction(
    txHash: string,
    userId?: string,
  ): Promise<VerifyTransactionResult> {
    try {
      const tx = await this.server
        .transactions()
        .transaction(txHash)
        .call();

      const result: VerifyTransactionResult = {
        status: tx.successful ? 'SUCCESS' : 'FAILED',
        details: tx,
      };

      // Log verification result
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
          }
        );
      }

      return result;
    } catch (error: any) {
      // Log verification attempt (pending status)
      if (userId) {
        await this.auditLogsService.logSystemEvent(
          AuditAction.TRANSACTION_VERIFIED,
          userId,
          {
            transactionHash: txHash,
            status: 'PENDING',
            error: error.message,
            network: process.env.STELLAR_NETWORK,
          }
        );
      }

      return { status: 'PENDING' };
    }
  }

  /* -------------------- HELPER METHODS -------------------- */

  /**
   * Generate a hash for private keys (never log the actual key)
   */
  private hashPrivateKey(privateKey: string): string {
    // Use a simple hash function - in production, use crypto module
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(privateKey).digest('hex').substring(0, 16);
  }

  /**
   * Generate a hash for transaction identification
   */
  private hashTransaction(transaction: Transaction): string {
    const hash = transaction.hash().toString('hex');
    return hash.substring(0, 16) + '...' + hash.substring(hash.length - 8);
  }

  /* -------------------- NEW METHODS FOR AUDIT LOGGING -------------------- */

  /**
   * Generate wallet with audit logging (backward compatible wrapper)
   */
  async generateWalletWithLogging(
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<GenerateWalletResult> {
    return this.generateWallet(userId, metadata);
  }

  /**
   * Create and log wallet generation event separately
   * (Useful when wallet is generated elsewhere but needs logging)
   */
  async logWalletGeneration(
    userId: string,
    publicKey: string,
    metadata?: Record<string, any>,
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
      true // Sensitive - contains public key
    );
  }

  /**
   * Log transaction creation event
   */
  async logTransactionEvent(
    userId: string,
    action: string,
    transactionHash: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.auditLogsService.logSystemEvent(
      action,
      userId,
      {
        transactionHash,
        network: process.env.STELLAR_NETWORK,
        ...metadata,
      }
    );
  }
}

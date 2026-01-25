import { Injectable } from '@nestjs/common';
import Server, {
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

@Injectable()
export class StellarService {
  private server: any;
  private networkPassphrase: string;

  constructor() {
    const horizonUrl = process.env.STELLAR_HORIZON_URL;
    const network = process.env.STELLAR_NETWORK;

    if (!horizonUrl || !network) {
      throw new Error('Stellar environment variables not configured');
    }

    this.server = new Server(horizonUrl);
    this.networkPassphrase = Networks[network as keyof typeof Networks];

    if (!this.networkPassphrase) {
      throw new Error(`Unsupported Stellar network: ${network}`);
    }
  }

  /* -------------------- WALLET -------------------- */

  generateWallet(): GenerateWalletResult {
    try {
      const keypair = Keypair.random();

      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
    } catch {
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

      return builder.setTimeout(180).build();
    } catch {
      throw new TransactionBuildError(
        'Failed to build Stellar transaction',
      );
    }
  }

  signTransaction(
    transaction: Transaction,
    secretKey: string,
  ): Transaction {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      transaction.sign(keypair);
      return transaction;
    } catch {
      throw new TransactionBuildError(
        'Failed to sign Stellar transaction',
      );
    }
  }

  async submitTransaction(transaction: Transaction) {
    try {
      return await this.server.submitTransaction(transaction);
    } catch (error: any) {
      throw new TransactionSubmissionError(
        error?.response?.data?.extras?.result_codes ||
          'Transaction submission failed',
      );
    }
  }

  async verifyTransaction(
    txHash: string,
  ): Promise<VerifyTransactionResult> {
    try {
      const tx = await this.server
        .transactions()
        .transaction(txHash)
        .call();

      return {
        status: tx.successful ? 'SUCCESS' : 'FAILED',
        details: tx,
      };
    } catch {
      return { status: 'PENDING' };
    }
  }
}

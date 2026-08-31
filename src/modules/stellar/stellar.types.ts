import { Transaction } from 'stellar-sdk';

export interface StellarKeypairResult {
  publicKey: string;
  secretKey: string;
}

export type GenerateWalletResult = StellarKeypairResult;

export interface CreateTransactionParams {
  sourcePublicKey: string;
  operations: unknown[];
  memo?: string;
  memoType?: string;
  userId?: string;
}

export interface VerifyTransactionResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  details?: unknown;
}

export interface WalletBalanceResult {
  asset: string;
  balance: string;
  assetIssuer?: string;
}

export interface SendPaymentResult {
  hash: string;
  ledger?: number;
}

export type StellarTransaction = Transaction;

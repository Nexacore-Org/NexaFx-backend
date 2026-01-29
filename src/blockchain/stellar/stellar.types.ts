import { Transaction } from 'stellar-sdk';

export interface GenerateWalletResult {
  publicKey: string;
  secretKey: string;
}

export interface CreateTransactionParams {
  sourcePublicKey: string;
  operations: any[];
  memo?: string;
  memoType?: string;
  userId?: string; // Optional for audit logging
}

export interface VerifyTransactionResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  details?: any;
}

export type StellarTransaction = Transaction;

// DTOs and Types
export interface StellarTransactionParams {
  destinationAddress: string;
  amount: string | number;
  asset: string; // 'XLM' for native token or 'CODE:ISSUER' for other assets
  memo?: string;
  timeout?: number; // Transaction timeout in seconds
}

export interface StellarTransactionResult {
  successful: boolean;
  transactionHash?: string;
  ledger?: number;
  createdAt?: string;
  resultXdr?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AssetBalance {
  asset: string;
  balance: string;
  limit?: string;
}

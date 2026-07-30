export interface DepositInitiationResult {
  reference: string;
  paymentLink: string;
  expiresAt: Date;
}

export interface WithdrawalInitiationResult {
  reference: string;
  estimatedArrival: Date;
}

export interface BankAccountDetails {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
}

export interface FiatRampProvider {
  initiateDeposit(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<DepositInitiationResult>;

  initiateWithdrawal(
    userId: string,
    amount: number,
    currency: string,
    bankAccount: BankAccountDetails,
  ): Promise<WithdrawalInitiationResult>;

  verifyBankAccount(
    bankCode: string,
    accountNumber: string,
  ): Promise<{ accountName: string }>;

  verifyWebhookSignature(
    payload: any,
    signature: string,
    secret: string,
  ): boolean;
}

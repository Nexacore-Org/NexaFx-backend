export class StellarError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class WalletGenerationError extends StellarError {}
export class TransactionBuildError extends StellarError {}
export class TransactionSubmissionError extends StellarError {}
export class TransactionVerificationError extends StellarError {}

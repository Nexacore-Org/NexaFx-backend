export interface StellarResultCodes {
  transaction?: string;
  operations?: string[];
}

export function formatStellarResultCodes(
  resultCodes?: StellarResultCodes,
  fallbackMessage = 'Stellar transaction submission failed',
): string {
  if (!resultCodes) {
    return fallbackMessage;
  }

  const codes = [
    ...(resultCodes.transaction ? [resultCodes.transaction] : []),
    ...(resultCodes.operations ?? []),
  ];

  return codes.length > 0 ? codes.join(': ') : fallbackMessage;
}

export class StellarError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class WalletGenerationError extends StellarError {}
export class TransactionBuildError extends StellarError {}
export class TransactionVerificationError extends StellarError {}

export class TransactionSubmissionError extends StellarError {
  readonly resultCodes?: StellarResultCodes;

  constructor(
    resultCodes?: StellarResultCodes,
    fallbackMessage = 'Stellar transaction submission failed',
  ) {
    super(formatStellarResultCodes(resultCodes, fallbackMessage));
    this.name = 'TransactionSubmissionError';
    this.resultCodes = resultCodes;
  }
}

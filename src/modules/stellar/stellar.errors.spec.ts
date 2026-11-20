import {
  TransactionSubmissionError,
  formatStellarResultCodes,
} from './stellar.errors';

describe('TransactionSubmissionError', () => {
  it('formats transaction and operation result codes into a readable message', () => {
    const error = new TransactionSubmissionError({
      transaction: 'tx_failed',
      operations: ['op_under_dest_min'],
    });

    expect(error.message).toBe('tx_failed: op_under_dest_min');
    expect(error.resultCodes).toEqual({
      transaction: 'tx_failed',
      operations: ['op_under_dest_min'],
    });
  });

  it('never stringifies result codes to [object Object]', () => {
    const error = new TransactionSubmissionError({
      operations: ['op_no_destination', 'op_low_reserve'],
    });

    expect(error.message).toBe('op_no_destination: op_low_reserve');
    expect(error.message).not.toContain('[object Object]');
  });

  it('falls back to a readable message when Horizon sends no result codes', () => {
    expect(new TransactionSubmissionError(undefined, 'Submission failed').message).toBe(
      'Submission failed',
    );
    expect(formatStellarResultCodes({})).toBe(
      'Stellar transaction submission failed',
    );
  });
});

import { TransactionConfidenceService } from './transaction-confidence.service';
import { StellarService } from '../../modules/stellar/stellar.service';
import { Transaction, TransactionType } from '../entities/transaction.entity';

describe('TransactionConfidenceService.scoreRecipient (#1456)', () => {
  const destinationAddress =
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  let stellarService: {
    accountExists: jest.Mock;
    getAccountBalance: jest.Mock;
  };
  let service: TransactionConfidenceService;

  const scoreRecipient = (overrides: Partial<Transaction> = {}) =>
    (
      service as unknown as {
        scoreRecipient: (t: Transaction) => Promise<{
          name: string;
          impact: number;
          description: string;
        }>;
      }
    ).scoreRecipient({
      type: TransactionType.WITHDRAW,
      metadata: { destinationAddress },
      ...overrides,
    } as Transaction);

  beforeEach(() => {
    stellarService = {
      accountExists: jest.fn(),
      // Returns '0' for a missing account, which is why it cannot be used to
      // detect one.
      getAccountBalance: jest.fn().mockResolvedValue('0'),
    };
    service = new TransactionConfidenceService(
      {} as never,
      stellarService as unknown as StellarService,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('marks an unfunded recipient negatively', async () => {
    stellarService.accountExists.mockResolvedValue(false);

    const factor = await scoreRecipient();

    expect(factor.name).toBe('recipient_account');
    expect(factor.impact).toBe(-10);
    expect(factor.description).toMatch(/not activated/i);
    expect(stellarService.accountExists).toHaveBeenCalledWith(
      destinationAddress,
    );
  });

  it('rewards a funded recipient', async () => {
    stellarService.accountExists.mockResolvedValue(true);

    const factor = await scoreRecipient();

    expect(factor.impact).toBe(5);
    expect(factor.description).toMatch(/active and funded/i);
  });

  it('is neutral, not "unfunded", when the check itself fails', async () => {
    stellarService.accountExists.mockRejectedValue(new Error('ETIMEDOUT'));

    const factor = await scoreRecipient();

    expect(factor.impact).toBe(0);
    expect(factor.description).toMatch(/could not be verified/i);
  });

  it('does not check deposits, which are incoming', async () => {
    const factor = await scoreRecipient({ type: TransactionType.DEPOSIT });

    expect(factor.impact).toBe(5);
    expect(stellarService.accountExists).not.toHaveBeenCalled();
  });

  it('skips validation when there is no destination address', async () => {
    const factor = await scoreRecipient({ metadata: {} });

    expect(factor.impact).toBe(0);
    expect(stellarService.accountExists).not.toHaveBeenCalled();
  });
});

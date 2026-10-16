import { DataSource } from 'typeorm';
import { seedFeeConfigs } from './fee-config.seed';
import {
  FeeConfig,
  FeeTransactionType,
  FeeType,
} from '../entities/fee-config.entity';

describe('seedFeeConfigs', () => {
  it('seeds only enum-backed rules, including SWAP', async () => {
    const savedConfigs: Partial<FeeConfig>[] = [];
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((config: Partial<FeeConfig>) => config),
      save: jest.fn(async (config: Partial<FeeConfig>) => {
        savedConfigs.push(config);
        return config;
      }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as unknown as DataSource;

    await seedFeeConfigs(dataSource);

    const transactionTypes = Object.values(FeeTransactionType);
    const feeTypes = Object.values(FeeType);
    expect(savedConfigs).toHaveLength(4);
    expect(
      savedConfigs.every(
        (config) =>
          transactionTypes.includes(config.transactionType!) &&
          feeTypes.includes(config.feeType!),
      ),
    ).toBe(true);
    expect(savedConfigs).toContainEqual(
      expect.objectContaining({
        transactionType: FeeTransactionType.SWAP,
        currency: '*',
        feeType: FeeType.PERCENTAGE,
      }),
    );
  });
});

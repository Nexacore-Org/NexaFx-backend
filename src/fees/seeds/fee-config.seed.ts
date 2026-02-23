import { DataSource } from 'typeorm';
import {
  FeeConfig,
  FeeTransactionType,
  FeeType,
} from '../entities/fee-config.entity';

/**
 * Seeds default fee configurations into the database.
 * Skips any config that already exists for the same transactionType + currency.
 */
export async function seedFeeConfigs(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(FeeConfig);

  const defaults: Partial<FeeConfig>[] = [
    {
      transactionType: FeeTransactionType.DEPOSIT,
      currency: '*',
      feeType: FeeType.FLAT,
      feeValue: '0.50000000',
      isActive: true,
    },
    {
      transactionType: FeeTransactionType.WITHDRAW,
      currency: '*',
      feeType: FeeType.PERCENTAGE,
      feeValue: '0.50000000',
      minFee: '0.10000000',
      maxFee: '50.00000000',
      isActive: true,
    },
    {
      transactionType: FeeTransactionType.CONVERT,
      currency: '*',
      feeType: FeeType.PERCENTAGE,
      feeValue: '0.25000000',
      minFee: '0.05000000',
      maxFee: '25.00000000',
      isActive: true,
    },
  ];

  for (const cfg of defaults) {
    const exists = await repo.findOne({
      where: {
        transactionType: cfg.transactionType,
        currency: cfg.currency,
      },
    });

    if (!exists) {
      await repo.save(repo.create(cfg));
    }
  }
}

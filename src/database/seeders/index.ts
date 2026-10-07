import { DataSource } from 'typeorm';
import { seedUsers } from './user.seeder';
import { seedCurrencies } from './currency.seeder';
import { seedExchangeRates } from './exchange-rate.seeder';
import { seedBeneficiaries } from './beneficiary.seeder';
import { seedTransactions } from './transaction.seeder';
import { seedReferrals } from './referral.seeder';
import { seedKyc } from './kyc.seeder';

/**
 * Orchestrates every seeder in dependency order. Each seeder is idempotent
 * (upsert-by-fixed-ID) so `npm run seed` can be re-run safely.
 */
export async function runAllSeeders(dataSource: DataSource): Promise<void> {
  await seedUsers(dataSource);
  await seedCurrencies(dataSource);
  await seedExchangeRates(dataSource);
  await seedBeneficiaries(dataSource);
  await seedTransactions(dataSource);
  await seedReferrals(dataSource);
  await seedKyc(dataSource);
}

import { DataSource } from 'typeorm';
import { seedUsers } from './user.seeder';
import { seedCurrencies } from './currency.seeder';
import { seedExchangeRates } from './exchange-rate.seeder';
import { seedBeneficiaries } from './beneficiary.seeder';
import { seedTransactions } from './transaction.seeder';
import { seedReferrals } from './referral.seeder';
import { seedKyc } from './kyc.seeder';
import { seedWallets } from './wallet.seeder';
import { seedCards } from './card.seeder';
import { seedLoans } from './loan.seeder';
import { seedVaults } from './vault.seeder';
import { seedWebhooks } from './webhook.seeder';
import { seedDao } from './dao.seeder';
import { seedDisputes } from './dispute.seeder';
import { seedEscrow } from './escrow.seeder';
import { seedInvoices } from './invoice.seeder';
import { seedReceipts } from './receipt.seeder';
import { seedPaymentSplits } from './payment-split.seeder';
import { seedGdprRequests } from './gdpr-request.seeder';

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

  // Wave 200: expanded domain coverage.
  await seedWallets(dataSource);
  await seedCards(dataSource);
  await seedLoans(dataSource);
  await seedVaults(dataSource);
  await seedWebhooks(dataSource);
  await seedDao(dataSource);
  await seedDisputes(dataSource);
  await seedEscrow(dataSource);
  await seedInvoices(dataSource);
  await seedReceipts(dataSource);
  await seedPaymentSplits(dataSource);
  await seedGdprRequests(dataSource);
}

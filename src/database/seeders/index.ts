import { DataSource } from 'typeorm';
import { seedUsers } from './user.seeder';
import { seedCurrencies } from './currency.seeder';
import { seedExchangeRates } from './exchange-rate.seeder';
import { seedTransactions } from './transaction.seeder';
import { seedKyc } from './kyc.seeder';
import { seedReferrals } from './referral.seeder';
import { seedBeneficiaries } from './beneficiary.seeder';

export async function runAllSeeders(dataSource: DataSource) {
    await seedUsers(dataSource);
    await seedCurrencies(dataSource);
    await seedExchangeRates(dataSource);
    await seedTransactions(dataSource);
    await seedKyc(dataSource);
    await seedReferrals(dataSource);
    await seedBeneficiaries(dataSource);
}

export {
    seedUsers,
    seedCurrencies,
    seedExchangeRates,
    seedTransactions,
    seedKyc,
    seedReferrals,
    seedBeneficiaries,
};

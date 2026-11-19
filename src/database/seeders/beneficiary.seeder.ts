import { DataSource } from 'typeorm';
import {
  Beneficiary,
  BeneficiaryNetwork,
} from '../../beneficiaries/entities/beneficiary.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedBeneficiaries(dataSource: DataSource) {
  const beneficiaryRepository = dataSource.getRepository(Beneficiary);
  const beneficiaries = Array.from({ length: 10 }, (_, i) => ({
    id: uuidv5(`beneficiary${i}`, NAMESPACE),
    userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
    nickname: `Beneficiary ${i + 1}`,
    walletAddress: `GSEED${i}`.padEnd(56, 'X'),
    currency: 'XLM',
    network: BeneficiaryNetwork.STELLAR,
    isDefault: i === 0,
    createdAt: new Date(Date.now() - i * 86400000),
    updatedAt: new Date(Date.now() - i * 86400000),
  }));
  await beneficiaryRepository.upsert(beneficiaries, ['id']);
}

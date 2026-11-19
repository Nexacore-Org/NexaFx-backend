import { DataSource } from 'typeorm';
import {
  DocumentType,
  KycRecord,
  KycStatus,
  KycTier,
} from '../../kyc/entities/kyc.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedKyc(dataSource: DataSource) {
  const kycRepository = dataSource.getRepository(KycRecord);
  const names = [
    'Super Admin',
    'Admin One',
    'Admin Two',
    'User One',
    'User Two',
  ];
  const keys = ['superadmin', 'admin1', 'admin2', 'user1', 'user2'];
  const records = keys.map((key, i) => ({
    id: uuidv5(`kyc-${key}`, NAMESPACE),
    userId: uuidv5(key, NAMESPACE),
    status: KycStatus.APPROVED,
    tier: KycTier.TIER_1,
    fullName: names[i],
    dateOfBirth: new Date('1990-01-01'),
    nationality: 'NG',
    documentType: DocumentType.NATIONAL_ID,
    documentNumber: `SEED-KYC-${i}`,
    documentFrontKey: `seed/kyc/${key}/front`,
    selfieKey: `seed/kyc/${key}/selfie`,
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await kycRepository.upsert(records, ['id']);
}

import { DataSource } from 'typeorm';
import { KycRecord, KycStatus } from '../../kyc/entities/kyc.entity';
import { User, UserKycTier } from '../../users/user.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedKyc(dataSource: DataSource) {
  const kycRepository = dataSource.getRepository(KycRecord);
  await kycRepository.upsert([], ['id']);
}
import { DataSource } from 'typeorm';
import { KYCApplication, KycStatus } from '../../kyc/entities/kyc-application.entity';
import { UserKycTier } from '../../users/user.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedKyc(dataSource: DataSource) {
    const kycRepository = dataSource.getRepository(KYCApplication);
    const kycs = Array.from({ length: 5 }, (_, i) => ({
        id: uuidv5(`kyc${i}`, NAMESPACE),
        userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
        targetTier: i < 3 ? UserKycTier.STANDARD : UserKycTier.ENHANCED,
        status: KycStatus.APPROVED,
        documents: {},
    }));
    await kycRepository.upsert(kycs, ['id']);
}

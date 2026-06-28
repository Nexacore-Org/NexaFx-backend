import { DataSource } from 'typeorm';
import { KYCApplication, KycStatus } from '../../kyc/entities/kyc-application.entity';
import { User, UserKycTier } from '../../users/user.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedKyc(dataSource: DataSource) {
    const kycRepository = dataSource.getRepository(KYCApplication);
    const userRepository = dataSource.getRepository(User);
    
    // Get or create a test user
    let testUser = await userRepository.findOne({ where: {} });
    if (!testUser) {
      testUser = await userRepository.save(userRepository.create({
        email: 'kyc-test@example.com',
        password: 'hashedpassword',
        passwordHash: 'hashedpassword',
        walletPublicKey: 'GTESTWALLETPUBLICKEY',
        walletSecretKeyEncrypted: 'encryptedsecret',
        referralCode: 'KYCTEST1',
        isVerified: true,
        isEmailVerified: true,
        kycTier: UserKycTier.BASIC,
        isActive: true,
      }));
    }

const kycs = Array.from({ length: 2 }, (_, i) => ({
        id: uuidv5(`kyc${i}`, NAMESPACE),
        userId: testUser.id,
        status: KycStatus.APPROVED,
        targetTier: i === 0 ? UserKycTier.STANDARD : UserKycTier.ENHANCED,
        documents: {},
        submittedAt: new Date(),
      }));
    await kycRepository.upsert(kycs, ['id']);
}

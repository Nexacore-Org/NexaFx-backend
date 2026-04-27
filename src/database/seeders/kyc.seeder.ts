import { DataSource } from 'typeorm';
import { Kyc } from '../../kyc/entities/kyc.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedKyc(dataSource: DataSource) {
    const kycRepository = dataSource.getRepository(Kyc);
    const kycs = Array.from({ length: 5 }, (_, i) => ({
        id: uuidv5(`kyc${i}`, NAMESPACE),
        userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
        status: 'APPROVED',
        documentType: 'PASSPORT',
        documentNumber: `A00000${i}`,
        issuedAt: new Date(Date.now() - i * 86400000),
        expiresAt: new Date(Date.now() + (365 - i) * 86400000),
    }));
    await kycRepository.upsert(kycs, ['id']);
}

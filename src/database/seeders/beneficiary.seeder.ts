import { DataSource } from 'typeorm';
import { Beneficiary } from '../../beneficiaries/entities/beneficiary.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedBeneficiaries(dataSource: DataSource) {
    const beneficiaryRepository = dataSource.getRepository(Beneficiary);
    const beneficiaries = Array.from({ length: 10 }, (_, i) => ({
        id: uuidv5(`beneficiary${i}`, NAMESPACE),
        userId: uuidv5(`user${(i % 5) + 1}`, NAMESPACE),
        name: `Beneficiary ${i + 1}`,
        accountNumber: `10000000${i}`,
        bank: 'Demo Bank',
        createdAt: new Date(Date.now() - i * 86400000),
    }));
    await beneficiaryRepository.upsert(beneficiaries, ['id']);
}

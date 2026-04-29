import { DataSource } from 'typeorm';
import { Referral } from '../../referrals/entities/referral.entity';
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

export async function seedReferrals(dataSource: DataSource) {
    const referralRepository = dataSource.getRepository(Referral);
    const referrals = [
        {
            id: uuidv5('ref1', NAMESPACE),
            referrerId: uuidv5('user1', NAMESPACE),
            refereeId: uuidv5('user2', NAMESPACE),
        },
        {
            id: uuidv5('ref2', NAMESPACE),
            referrerId: uuidv5('user2', NAMESPACE),
            refereeId: uuidv5('user3', NAMESPACE),
        },
        {
            id: uuidv5('ref3', NAMESPACE),
            referrerId: uuidv5('user3', NAMESPACE),
            refereeId: uuidv5('user4', NAMESPACE),
        },
    ];
    await referralRepository.upsert(referrals, ['id']);
}

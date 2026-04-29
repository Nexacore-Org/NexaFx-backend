import { DataSource } from 'typeorm';
import { User } from '../../users/user.entity';
import { v5 as uuidv5 } from 'uuid';
import * as bcrypt from 'bcrypt';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e'; // Fixed UUID namespace

export async function seedUsers(dataSource: DataSource) {
    const userRepository = dataSource.getRepository(User);
    const users = [
        {
            id: uuidv5('superadmin', NAMESPACE),
            email: 'superadmin@nexa.com',
            password: await bcrypt.hash('SuperAdminPass123!', 10),
            role: 'SUPER_ADMIN',
            isVerified: true,
            isTwoFactorEnabled: false,
        },
        {
            id: uuidv5('admin1', NAMESPACE),
            email: 'admin1@nexa.com',
            password: await bcrypt.hash('AdminPass1!', 10),
            role: 'ADMIN',
            isVerified: true,
            isTwoFactorEnabled: false,
        },
        {
            id: uuidv5('admin2', NAMESPACE),
            email: 'admin2@nexa.com',
            password: await bcrypt.hash('AdminPass2!', 10),
            role: 'ADMIN',
            isVerified: true,
            isTwoFactorEnabled: false,
        },
        {
            id: uuidv5('user1', NAMESPACE),
            email: 'user1@nexa.com',
            password: await bcrypt.hash('UserPass1!', 10),
            role: 'USER',
            isVerified: true,
            isTwoFactorEnabled: false,
        },
        {
            id: uuidv5('user2', NAMESPACE),
            email: 'user2@nexa.com',
            password: await bcrypt.hash('UserPass2!', 10),
            role: 'USER',
            isVerified: true,
            isTwoFactorEnabled: false,
        },
    ];
    await userRepository.upsert(users, ['id']);
}

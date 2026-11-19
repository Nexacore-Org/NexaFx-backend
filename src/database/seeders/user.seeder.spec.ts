import { DataSource } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import { User, UserRole } from '../../users/user.entity';
import { seedUsers } from './user.seeder';

const NAMESPACE = 'b8a5e6e0-2e7c-4c1a-9c1e-2e7c4c1a9c1e';

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (password: string) => `hashed:${password}`),
}));

describe('seedUsers', () => {
  it('upserts the fixed-UUID users with enum-backed roles', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ upsert }),
    } as unknown as DataSource;

    await seedUsers(dataSource);

    expect(dataSource.getRepository).toHaveBeenCalledWith(User);
    expect(upsert).toHaveBeenCalledTimes(1);

    const [users, conflictPaths] = upsert.mock.calls[0];
    expect(conflictPaths).toEqual(['id']);
    expect(users).toHaveLength(5);
    expect(users).toEqual([
      expect.objectContaining({
        id: uuidv5('superadmin', NAMESPACE),
        email: 'superadmin@nexa.com',
        role: UserRole.SUPER_ADMIN,
        isEmailVerified: true,
        isActive: true,
      }),
      expect.objectContaining({
        id: uuidv5('admin1', NAMESPACE),
        email: 'admin1@nexa.com',
        role: UserRole.ADMIN,
      }),
      expect.objectContaining({
        id: uuidv5('admin2', NAMESPACE),
        email: 'admin2@nexa.com',
        role: UserRole.ADMIN,
      }),
      expect.objectContaining({
        id: uuidv5('user1', NAMESPACE),
        email: 'user1@nexa.com',
        role: UserRole.USER,
      }),
      expect.objectContaining({
        id: uuidv5('user2', NAMESPACE),
        email: 'user2@nexa.com',
        role: UserRole.USER,
      }),
    ]);
  });
});

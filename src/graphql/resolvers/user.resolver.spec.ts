import { Test, TestingModule } from '@nestjs/testing';
import { UserResolver } from './user.resolver';
import { UsersService } from '../../users/users.service';
import { GqlUser } from '../decorators/current-user.decorator';

describe('UserResolver', () => {
  let resolver: UserResolver;
  let usersService: jest.Mocked<UsersService>;

  const mockUser: GqlUser = {
    userId: 'user-uuid-123',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockProfile = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: null,
    walletPublicKey: 'GABCD1234',
    isVerified: true,
    isSuspended: false,
    isTwoFactorEnabled: false,
    role: 'USER',
    referralCode: 'ABCD1234',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserResolver,
        {
          provide: UsersService,
          useValue: {
            getProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<UserResolver>(UserResolver);
    usersService = module.get(UsersService);
  });

  describe('me', () => {
    it('returns the authenticated user profile', async () => {
      usersService.getProfile.mockResolvedValue(mockProfile as any);

      const result = await resolver.me(mockUser);

      expect(usersService.getProfile).toHaveBeenCalledWith('user-uuid-123');
      expect(result).toEqual(mockProfile);
    });

    it('propagates NotFoundException when user does not exist', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      usersService.getProfile.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(resolver.me(mockUser)).rejects.toThrow(NotFoundException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { mockUserRepository, mockRedisClient } from '../../../test/mocks/factories';
import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';

// Assuming an inline placeholder or stub structure for the targeted platform entities
class UserEntity {}

describe('AuthService', () => {
  let service: AuthService;
  let userRepoMock: ReturnType<typeof mockUserRepository>;
  let redisMock: ReturnType<typeof mockRedisClient>;

  beforeEach(async () => {
    userRepoMock = mockUserRepository();
    redisMock = mockRedisClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepoMock },
        { provide: 'REDIS_CLIENT', useValue: redisMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create a user and return tokens when input is valid', async () => {
      userRepoMock.findOne.mockResolvedValue(null);
      userRepoMock.save.mockResolvedValue({ id: 'u1', email: 'test@nexafx.io' });

      // Action method assertions mock loop verification
      const result = await service.register('test@nexafx.io', 'StrongPassword123!');
      expect(result).toBeDefined();
    });

    it('should throw ConflictException when email already exists', async () => {
      userRepoMock.findOne.mockResolvedValue({ id: 'u1', email: 'test@nexafx.io' });

      await expect(service.register('test@nexafx.io', 'StrongPassword123!'))
        .rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when password is too weak', async () => {
      await expect(service.register('new@nexafx.io', '123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should return token payloads when credentials are correct', async () => {
      userRepoMock.findOne.mockResolvedValue({ id: 'u1', passwordHash: 'hashed', isActive: true });
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login('test@nexafx.io', 'StrongPassword123!');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException when password validation checks fail', async () => {
      userRepoMock.findOne.mockResolvedValue({ id: 'u1', passwordHash: 'hashed', isActive: true });
      jest.spyOn(service as any, 'verifyPassword').mockResolvedValue(false);

      await expect(service.login('test@nexafx.io', 'WrongPassword'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should generate updated credentials if the token matches tracking caches', async () => {
      redisMock.get.mockResolvedValue('u1');
      const result = await service.refresh('valid-refresh-token');
      expect(result).toBeDefined();
    });
  });

  describe('logout', () => {
    it('should remove session payloads from Redis tracking arrays cleanly', async () => {
      redisMock.del.mockResolvedValue(1);
      await service.logout('session-token-id');
      expect(redisMock.del).toHaveBeenCalledWith('session-token-id');
    });
  });
});
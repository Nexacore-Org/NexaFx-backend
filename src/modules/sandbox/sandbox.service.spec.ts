import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxAccount } from './entities/sandbox-account.entity';
import { SandboxEvent } from './entities/sandbox-event.entity';
import { SandboxRequestLog } from './entities/sandbox-request-log.entity';
import { UsersService } from '../../users/users.service';
import { WalletsService } from '../../wallets/wallets.service';
import { RedisService } from '../redis/redis.service';
import { createMockRepository } from '../../../test/mocks/factories';

// Prevent loading the real (heavy) service implementations, which pull in
// unrelated modules that do not load cleanly in isolation.
jest.mock('../../wallets/wallets.service', () => ({
  WalletsService: class {},
}));
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));

describe('SandboxService', () => {
  let service: SandboxService;
  let sandboxAccountRepo: any;
  let sandboxEventRepo: any;
  let sandboxRequestLogRepo: any;
  let walletsService: any;
  let redisService: any;

  beforeEach(async () => {
    sandboxAccountRepo = createMockRepository();
    sandboxEventRepo = createMockRepository();
    sandboxRequestLogRepo = createMockRepository({
      remove: jest.fn().mockResolvedValue([]),
    });
    walletsService = {
      create: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      deleteByUserId: jest.fn().mockResolvedValue(undefined),
    };
    redisService = { deleteByPattern: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
        {
          provide: getRepositoryToken(SandboxAccount),
          useValue: sandboxAccountRepo,
        },
        {
          provide: getRepositoryToken(SandboxEvent),
          useValue: sandboxEventRepo,
        },
        {
          provide: getRepositoryToken(SandboxRequestLog),
          useValue: sandboxRequestLogRepo,
        },
        { provide: UsersService, useValue: {} },
        { provide: WalletsService, useValue: walletsService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('creates a sandbox account with a prefixed api key and seeds data', async () => {
      sandboxAccountRepo.findOne.mockResolvedValue(null);
      sandboxAccountRepo.create.mockImplementation((e) => e);
      sandboxAccountRepo.save.mockResolvedValue({
        id: 'sandbox-1',
        userId: 'user-1',
        sandboxApiKey: 'nxa_test_abc',
        resetCount: 0,
      });

      const result = await service.register('user-1');

      expect(result.apiKey).toMatch(/^nxa_test_[0-9a-f]{48}$/);
      expect(sandboxAccountRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        sandboxApiKey: expect.stringMatching(/^nxa_test_/),
        resetCount: 0,
      });
      expect(walletsService.create).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '10000.00000000',
      );
      // Three seed events are triggered in seedSandboxData.
      expect(sandboxEventRepo.save).toHaveBeenCalledTimes(3);
    });

    it('throws BadRequestException when an account already exists', async () => {
      sandboxAccountRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.register('user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(sandboxAccountRepo.save).not.toHaveBeenCalled();
      expect(walletsService.create).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('throws NotFoundException when no account exists', async () => {
      sandboxAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.reset('user-1')).rejects.toThrow(NotFoundException);
      expect(walletsService.deleteByUserId).not.toHaveBeenCalled();
    });

    it('clears events, request logs, wallets, redis and reseeds', async () => {
      sandboxAccountRepo.findOne.mockResolvedValue({
        id: 'sandbox-1',
        resetCount: 2,
      });
      sandboxAccountRepo.save.mockResolvedValue({
        id: 'sandbox-1',
        resetCount: 3,
      });

      const result = await service.reset('user-1');

      expect(sandboxEventRepo.delete).toHaveBeenCalledWith({
        sandboxAccountId: 'sandbox-1',
      });
      expect(sandboxRequestLogRepo.delete).toHaveBeenCalledWith({
        sandboxAccountId: 'sandbox-1',
      });
      expect(walletsService.deleteByUserId).toHaveBeenCalledWith('user-1');
      expect(redisService.deleteByPattern).toHaveBeenCalledWith(
        'sandbox:sandbox-1:*',
      );
      expect(sandboxAccountRepo.save).toHaveBeenCalledWith({
        id: 'sandbox-1',
        resetCount: 3,
      });
      // Reseeded: wallet recreated and 3 seed events.
      expect(walletsService.create).toHaveBeenCalledWith(
        'user-1',
        'XLM',
        '10000.00000000',
      );
      expect(result.resetCount).toBe(3);
    });
  });

  describe('findByUserId', () => {
    it('returns the account for the user', async () => {
      sandboxAccountRepo.findOne.mockResolvedValue({ id: 'sandbox-1' });

      const result = await service.findByUserId('user-1');

      expect(sandboxAccountRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toEqual({ id: 'sandbox-1' });
    });
  });

  describe('getEvents', () => {
    it('queries events ordered newest first, capped at 100', async () => {
      const events = [{ id: 'evt-1' }];
      sandboxEventRepo.find.mockResolvedValue(events);

      const result = await service.getEvents('sandbox-1');

      expect(sandboxEventRepo.find).toHaveBeenCalledWith({
        where: { sandboxAccountId: 'sandbox-1' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      expect(result).toEqual(events);
    });
  });

  describe('triggerEvent', () => {
    it('creates and saves a sandbox event', async () => {
      const event = {
        sandboxAccountId: 'sandbox-1',
        eventType: 'X',
        data: { a: 1 },
      };
      sandboxEventRepo.create.mockImplementation((e) => e);
      sandboxEventRepo.save.mockResolvedValue({ id: 'evt-1', ...event });

      const result = await service.triggerEvent('sandbox-1', 'X', { a: 1 });

      expect(sandboxEventRepo.create).toHaveBeenCalledWith(event);
      expect(sandboxEventRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('evt-1');
    });
  });

  describe('getRequestLog', () => {
    it('returns request logs ordered newest first, capped at 100', async () => {
      const logs = [{ id: 'log-1' }];
      sandboxRequestLogRepo.find.mockResolvedValue(logs);

      const result = await service.getRequestLog('sandbox-1');

      expect(sandboxRequestLogRepo.find).toHaveBeenCalledWith({
        where: { sandboxAccountId: 'sandbox-1' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
      expect(result).toEqual(logs);
    });
  });

  describe('logRequest', () => {
    it('saves a request log and does not prune when under the limit', async () => {
      sandboxRequestLogRepo.create.mockImplementation((e) => e);
      sandboxRequestLogRepo.save.mockResolvedValue({ id: 'log-1' });
      sandboxRequestLogRepo.count.mockResolvedValue(10);

      const result = await service.logRequest(
        'sandbox-1',
        'GET',
        '/v2/sandbox/events',
        200,
        15,
      );

      expect(sandboxRequestLogRepo.create).toHaveBeenCalledWith({
        sandboxAccountId: 'sandbox-1',
        method: 'GET',
        path: '/v2/sandbox/events',
        statusCode: 200,
        durationMs: 15,
      });
      expect(sandboxRequestLogRepo.remove).not.toHaveBeenCalled();
      expect(result.id).toBe('log-1');
    });

    it('prunes the oldest logs once the count exceeds 100', async () => {
      sandboxRequestLogRepo.create.mockImplementation((e) => e);
      sandboxRequestLogRepo.save.mockResolvedValue({ id: 'log-1' });
      sandboxRequestLogRepo.count.mockResolvedValue(105);
      const oldLogs = [
        { id: 'log-1' },
        { id: 'log-2' },
        { id: 'log-3' },
        { id: 'log-4' },
        { id: 'log-5' },
      ];
      sandboxRequestLogRepo.find.mockResolvedValue(oldLogs);
      sandboxRequestLogRepo.remove.mockResolvedValue(oldLogs);

      await service.logRequest('sandbox-1', 'GET', '/path', 200, 5);

      expect(sandboxRequestLogRepo.find).toHaveBeenCalledWith({
        where: { sandboxAccountId: 'sandbox-1' },
        order: { createdAt: 'ASC' },
        take: 5,
      });
      expect(sandboxRequestLogRepo.remove).toHaveBeenCalledWith(oldLogs);
    });
  });
});

jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const tokenFor = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(tokenFor(entity)),
    getRepositoryToken: tokenFor,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));

jest.mock('@nestjs/bullmq', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  return {
    InjectQueue: (name: string) => Inject(`BullQueue_${name}`),
    Processor: () => () => undefined,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { GdprService } from './gdpr.service';
import { GdprConsent } from './entities/gdpr-consent.entity';
import { ErasureAuditLog } from './entities/erasure-audit-log.entity';
import { STORAGE_SERVICE_TOKEN } from '../storage/storage.service';
import { RedisService } from '../redis/redis.service';

jest.mock('bcrypt');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Lightweight entity stubs so getRepositoryToken resolves without importing the whole graph
class User {}
class Transaction {}
class KYCApplication {}
class Notification {}
class RateAlert {}
class WebhookEndpoint {}
class WebhookDelivery {}
class AuditLog {}
class RefreshToken {}
class Expense {}

describe('GdprService', () => {
  let service: GdprService;

  const mockRepo = () => ({
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((e) => Promise.resolve({ id: 'id-1', ...e })),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  let consentRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let txRepo: ReturnType<typeof mockRepo>;
  let kycRepo: ReturnType<typeof mockRepo>;
  let notificationRepo: ReturnType<typeof mockRepo>;
  let rateAlertRepo: ReturnType<typeof mockRepo>;
  let webhookEndpointRepo: ReturnType<typeof mockRepo>;
  let webhookDeliveryRepo: ReturnType<typeof mockRepo>;
  let auditLogRepo: ReturnType<typeof mockRepo>;
  let refreshTokenRepo: ReturnType<typeof mockRepo>;
  let erasureAuditRepo: ReturnType<typeof mockRepo>;
  let expenseRepo: ReturnType<typeof mockRepo>;
  let storageService: { delete: jest.Mock };
  let exportQueue: { add: jest.Mock; getJobs: jest.Mock };
  let redisClient: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let redisService: { key: jest.Mock; rawClient: typeof redisClient };

  beforeEach(async () => {
    consentRepo = mockRepo();
    userRepo = mockRepo();
    txRepo = mockRepo();
    kycRepo = mockRepo();
    notificationRepo = mockRepo();
    rateAlertRepo = mockRepo();
    webhookEndpointRepo = mockRepo();
    webhookDeliveryRepo = mockRepo();
    auditLogRepo = mockRepo();
    refreshTokenRepo = mockRepo();
    erasureAuditRepo = mockRepo();
    expenseRepo = mockRepo();
    storageService = { delete: jest.fn().mockResolvedValue(undefined) };
    exportQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      key: jest.fn((mod: string, k: string) => `nexafx:test:${mod}:${k}`),
      rawClient: redisClient,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: getRepositoryToken(GdprConsent), useValue: consentRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        { provide: getRepositoryToken(KYCApplication), useValue: kycRepo },
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepo,
        },
        { provide: getRepositoryToken(RateAlert), useValue: rateAlertRepo },
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: webhookEndpointRepo,
        },
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: webhookDeliveryRepo,
        },
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepo },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
        {
          provide: getRepositoryToken(ErasureAuditLog),
          useValue: erasureAuditRepo,
        },
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: STORAGE_SERVICE_TOKEN, useValue: storageService },
        { provide: 'BullQueue_gdpr-export', useValue: exportQueue },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('1.0.0') },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get(GdprService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('recordConsent', () => {
    it('records consent with timestamp and metadata', async () => {
      const before = Date.now();
      await service.recordConsent('user-1', 'v2.0', '1.2.3.4', 'Mozilla/5.0');
      const after = Date.now();

      expect(consentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          version: 'v2.0',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
        }),
      );
      expect(consentRepo.save).toHaveBeenCalled();
      const createdAt = consentRepo.create.mock.calls[0][0].consentedAt as Date;
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(createdAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('eraseUser', () => {
    const baseUser = {
      id: 'user-1',
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Smith',
      password: 'hashed',
      twoFactorSecret: 'secret',
      isActive: true,
      deletedAt: null,
    };

    it('anonymises PII and creates ErasureAuditLog', async () => {
      userRepo.findOne.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      txRepo.count.mockResolvedValue(0);
      kycRepo.find.mockResolvedValue([]);
      expenseRepo.find.mockResolvedValue([]);

      const result = await service.eraseUser('user-1', 'password');

      expect(result.status).toBe('erased');
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'deleted-user-1@nexafx.deleted',
          firstName: 'Deleted',
          lastName: 'Deleted',
          password: null,
          isActive: false,
        }),
      );
      expect(erasureAuditRepo.create).toHaveBeenCalled();
      expect(erasureAuditRepo.save).toHaveBeenCalled();
      expect(auditLogRepo.save).toHaveBeenCalled();
    });

    it('rejects invalid password', async () => {
      userRepo.findOne.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(false as never);
      await expect(service.eraseUser('user-1', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(erasureAuditRepo.save).not.toHaveBeenCalled();
    });

    it('rejects when user has pending transactions', async () => {
      userRepo.findOne.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      txRepo.count.mockResolvedValue(2);
      await expect(service.eraseUser('user-1', 'password')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws NotFoundException for missing user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.eraseUser('missing', 'password')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('still creates erasure audit log when S3 deletions fail', async () => {
      userRepo.findOne.mockResolvedValue({ ...baseUser });
      mockedBcrypt.compare.mockResolvedValue(true as never);
      txRepo.count.mockResolvedValue(0);
      kycRepo.find.mockResolvedValue([
        {
          documents: {
            governmentIdFront: {
              s3Key: 'kyc/front.jpg',
              mimeType: 'image/jpeg',
            },
          },
        },
      ]);
      expenseRepo.find.mockResolvedValue([]);
      storageService.delete.mockRejectedValue(new Error('S3 down'));

      const result = await service.eraseUser('user-1', 'password');

      expect(result.status).toBe('erased');
      expect(erasureAuditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedDeletions: expect.arrayContaining(['kyc/front.jpg']),
        }),
      );
    });
  });

  describe('requestExport', () => {
    it('queues an export job for an existing user', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      const jobId = await service.requestExport('user-1');
      expect(jobId).toBe('job-1');
      expect(exportQueue.add).toHaveBeenCalledWith(
        'export',
        { userId: 'user-1', email: 'a@b.com' },
        expect.objectContaining({
          jobId: expect.stringContaining('export-user-1'),
        }),
      );
    });

    it('throws when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.requestExport('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('enforceDataRetentionPolicies (#1502)', () => {
    const buildUserEligibilityQb = (batches: Array<Array<{ id: string }>>) => {
      let callIdx = 0;
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockImplementation(async () => {
          const next = batches[callIdx] ?? [];
          callIdx += 1;
          return next;
        }),
      };
      return qb;
    };

    it('issues one NOT EXISTS eligibility query per batch (not per user) and never queries transactionRepository per user', async () => {
      const userQb = buildUserEligibilityQb([
        [{ id: 'user-a' }, { id: 'user-b' }],
        [{ id: 'user-c' }],
      ]);
      userRepo.createQueryBuilder.mockReturnValue(userQb);

      await service.enforceDataRetentionPolicies(2);

      // 2 batch queries total for 3 users, 0 per-user transaction queries
      expect(userQb.getMany).toHaveBeenCalledTimes(2);
      expect(userQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('NOT EXISTS'),
        expect.objectContaining({ sevenYearsAgo: expect.any(Date) }),
      );
      expect(txRepo.count).not.toHaveBeenCalled();
      expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(userRepo.delete).toHaveBeenCalledTimes(3);
    });

    it('isolates per-user delete errors so a failing delete does not abort remaining users or the audit log', async () => {
      const userQb = buildUserEligibilityQb([
        [{ id: 'user-1' }, { id: 'user-2-fk-fail' }, { id: 'user-3' }],
      ]);
      userRepo.createQueryBuilder.mockReturnValue(userQb);

      userRepo.delete
        .mockResolvedValueOnce({ affected: 1 })
        .mockRejectedValueOnce(new Error('FK constraint violation on user-2'))
        .mockResolvedValueOnce({ affected: 1 });

      await service.enforceDataRetentionPolicies(10);

      expect(userRepo.delete).toHaveBeenCalledTimes(3);
      expect(userRepo.delete).toHaveBeenNthCalledWith(1, 'user-1');
      expect(userRepo.delete).toHaveBeenNthCalledWith(2, 'user-2-fk-fail');
      expect(userRepo.delete).toHaveBeenNthCalledWith(3, 'user-3');

      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'gdpr.data_retention_cron',
          metadata: expect.objectContaining({
            usersHardDeleted: 2,
            failureCount: 1,
            failedUsersCount: 1,
            failures: [
              expect.objectContaining({
                userId: 'user-2-fk-fail',
                error: expect.stringContaining('FK constraint violation'),
              }),
            ],
          }),
        }),
      );
      expect(auditLogRepo.save).toHaveBeenCalledTimes(1);
    });

    it('skips execution when the Redis distributed lock is already held by another replica', async () => {
      redisClient.set.mockResolvedValueOnce(null);

      await service.enforceDataRetentionPolicies();

      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(auditLogRepo.save).not.toHaveBeenCalled();
    });
  });
});

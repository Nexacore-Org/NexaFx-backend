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
import { RedisService } from '../../modules/redis/redis.service';

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
  let redisService: {
    isReady: jest.Mock;
    key: jest.Mock;
    rawClient: { set: jest.Mock; eval: jest.Mock };
  };

  const createQueryBuilderMock = () => {
    const queryBuilder = {
      select: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setParameter: jest.fn(),
      orderBy: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    for (const method of [
      'select',
      'where',
      'andWhere',
      'setParameter',
      'orderBy',
      'take',
    ] as const) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    return queryBuilder;
  };

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
    redisService = {
      isReady: jest.fn().mockResolvedValue(true),
      key: jest.fn().mockReturnValue('nexafx:test:gdpr:data-retention'),
      rawClient: {
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      },
    };
    notificationRepo.createQueryBuilder.mockReturnValue(
      createQueryBuilderMock(),
    );
    webhookDeliveryRepo.createQueryBuilder.mockReturnValue(
      createQueryBuilderMock(),
    );

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
        { provide: RedisService, useValue: redisService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('1.0.0') },
        },
      ],
    }).compile();

    service = module.get(GdprService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('enforceDataRetentionPolicies', () => {
    it('selects inactive users with no financial transactions in the retention window', async () => {
      const userQueryBuilder = createQueryBuilderMock();
      userRepo.createQueryBuilder.mockReturnValue(userQueryBuilder);

      await service.enforceDataRetentionPolicies();

      expect(userQueryBuilder.where).toHaveBeenCalledWith(
        'user.isActive = :isActive',
        { isActive: false },
      );
      expect(userQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.deletedAt < :thirtyDaysAgo',
        expect.objectContaining({ thirtyDaysAgo: expect.any(Date) }),
      );
      const notExistsPredicate = userQueryBuilder.andWhere.mock.calls.find(
        ([condition]) => typeof condition === 'function',
      )?.[0] as (queryBuilder: { subQuery: jest.Mock }) => string;
      const subQuery = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest
          .fn()
          .mockReturnValue('(SELECT 1 FROM transactions tx WHERE ... )'),
      };

      expect(
        notExistsPredicate({ subQuery: jest.fn().mockReturnValue(subQuery) }),
      ).toBe('NOT EXISTS (SELECT 1 FROM transactions tx WHERE ... )');
      expect(subQuery.where).toHaveBeenCalledWith('tx.userId = user.id');
      expect(subQuery.andWhere).toHaveBeenCalledWith(
        'tx.createdAt > :sevenYearsAgo',
      );
      expect(userQueryBuilder.take).toHaveBeenCalledWith(500);
      expect(txRepo.count).not.toHaveBeenCalled();
      expect(auditLogRepo.save).toHaveBeenCalled();
    });

    it('continues after one user deletion fails and audits the failed user', async () => {
      const userQueryBuilder = createQueryBuilderMock();
      userQueryBuilder.getMany
        .mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }])
        .mockResolvedValueOnce([]);
      userRepo.createQueryBuilder.mockReturnValue(userQueryBuilder);
      userRepo.delete
        .mockRejectedValueOnce(new Error('foreign key constraint'))
        .mockResolvedValueOnce({ affected: 1 });

      await service.enforceDataRetentionPolicies();

      expect(userRepo.delete).toHaveBeenNthCalledWith(1, 'user-1');
      expect(userRepo.delete).toHaveBeenNthCalledWith(2, 'user-2');
      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'FAILURE',
          metadata: expect.objectContaining({
            usersHardDeleted: 1,
            usersHardDeleteFailures: [
              expect.objectContaining({
                userId: 'user-1',
                error: 'foreign key constraint',
              }),
            ],
          }),
        }),
      );
      expect(auditLogRepo.save).toHaveBeenCalled();
    });
  });

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
});

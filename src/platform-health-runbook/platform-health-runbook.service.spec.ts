import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource, Repository } from 'typeorm';
import { PlatformHealthRunbookService } from './platform-health-runbook.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/entities/transaction.entity';
import {
  EMAIL_QUEUE,
  WEBHOOK_QUEUE,
  TAX_QUEUE,
} from '../modules/queues/queue.constants';

describe('PlatformHealthRunbookService', () => {
  let service: PlatformHealthRunbookService;
  let transactionRepo: Repository<Transaction>;
  let emailQueue: any;
  let webhookQueue: any;
  let taxQueue: any;
  let dataSource: DataSource;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  const mockRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const createMockQueue = () => ({
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(100),
    getFailedCount: jest.fn().mockResolvedValue(0),
  });

  const mockQueryRunner = {
    connect: jest.fn(),
    query: jest.fn().mockResolvedValue([
      {
        totalConnections: '10',
        idleConnections: '5',
        activeConnections: '5',
      },
    ]),
    release: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    emailQueue = createMockQueue();
    webhookQueue = createMockQueue();
    taxQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformHealthRunbookService,
        { provide: getRepositoryToken(Transaction), useValue: mockRepository },
        { provide: getQueueToken(EMAIL_QUEUE), useValue: emailQueue },
        { provide: getQueueToken(WEBHOOK_QUEUE), useValue: webhookQueue },
        { provide: getQueueToken(TAX_QUEUE), useValue: taxQueue },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PlatformHealthRunbookService>(
      PlatformHealthRunbookService,
    );
    transactionRepo = module.get(getRepositoryToken(Transaction));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSnapshot', () => {
    it('should return a health snapshot with all components', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      const snapshot = await service.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.cronJobs).toBeInstanceOf(Array);
      expect(snapshot.queues).toBeInstanceOf(Array);
      expect(snapshot.database).toBeDefined();
      expect(snapshot.recentErrors).toBeInstanceOf(Array);
      expect(['healthy', 'degraded', 'critical']).toContain(
        snapshot.overallStatus,
      );
    });

    it('should report healthy status when all systems are nominal', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      const snapshot = await service.getSnapshot();

      expect(snapshot.overallStatus).toBe('healthy');
    });

    it('should report critical status when queues have high failure rates', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      emailQueue.getFailedCount.mockResolvedValue(15);

      const snapshot = await service.getSnapshot();

      expect(snapshot.overallStatus).toBe('critical');
      expect(
        snapshot.queues.find((q) => q.name === EMAIL_QUEUE)?.failed,
      ).toBe(15);
    });

    it('should return queue depths for all queues', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      emailQueue.getWaitingCount.mockResolvedValue(5);
      emailQueue.getActiveCount.mockResolvedValue(2);

      const snapshot = await service.getSnapshot();

      expect(snapshot.queues).toHaveLength(3);
      const emailQueueStats = snapshot.queues.find(
        (q) => q.name === EMAIL_QUEUE,
      );
      expect(emailQueueStats?.waiting).toBe(5);
      expect(emailQueueStats?.active).toBe(2);
    });

    it('should return database pool stats', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      const snapshot = await service.getSnapshot();

      expect(snapshot.database.totalConnections).toBe(10);
      expect(snapshot.database.idleConnections).toBe(5);
      expect(snapshot.database.activeConnections).toBe(5);
    });

    it('should handle database query failures gracefully', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      mockQueryRunner.query.mockRejectedValue(new Error('DB connection failed'));

      const snapshot = await service.getSnapshot();

      expect(snapshot.database.totalConnections).toBe(0);
    });

    it('should handle queue query failures gracefully', async () => {
      mockRepository.findOne.mockResolvedValue({
        createdAt: new Date(),
        status: TransactionStatus.COMPLETED,
      });

      emailQueue.getWaitingCount.mockRejectedValue(new Error('Queue unavailable'));

      const snapshot = await service.getSnapshot();

      expect(snapshot.queues[0].waiting).toBe(0);
    });
  });
});

// **src/activity-logs/activity-logs.service.spec.ts**


import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLog } from './entities/activity-log.entity';
import { ActivityType } from './constants/activity-types.enum';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;
const createMockRepository = <T = any>(): MockRepository<T> => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  })),
});

describe('ActivityLogsService', () => {
  let service: ActivityLogsService;
  let repository: MockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogsService,
        {
          provide: getRepositoryToken(ActivityLog),
          useFactory: createMockRepository,
        },
      ],
    }).compile();

    service = module.get<ActivityLogsService>(ActivityLogsService);
    repository = module.get<MockRepository>(getRepositoryToken(ActivityLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logActivity', () => {
    it('should successfully log an activity', async () => {
      const userId = 'test-user-id';
      const action = ActivityType.USER_LOGIN;
      const metadata = { ip: '192.168.1.1' };
      
      const mockLog = {
        id: 'log-id',
        userId,
        action,
        metadata,
        timestamp: new Date(),
      };
      
      repository.create.mockReturnValue(mockLog);
      repository.save.mockResolvedValue(mockLog);
      
      const result = await service.logActivity(userId, action, metadata);
      
      expect(repository.create).toHaveBeenCalledWith({
        userId,
        action,
        metadata,
      });
      expect(repository.save).toHaveBeenCalledWith(mockLog);
      expect(result).toEqual(mockLog);
    });
  });

  describe('findByUser', () => {
    it('should return logs for a specific user', async () => {
      const userId = 'test-user-id';
      const mockLogs = [{ id: 'log-1', userId, action: ActivityType.USER_LOGIN }];
      
      repository.find.mockResolvedValue(mockLogs);
      
      const result = await service.findByUser(userId);
      
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { timestamp: 'DESC' },
      });
      expect(result).toEqual(mockLogs);
    });
  });

  describe('findWithFilters', () => {
    it('should apply all provided filters', async () => {
      const filters = {
        userId: 'test-user-id',
        action: ActivityType.TRANSACTION_CREATED,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
      };
      
      const mockQueryBuilder = repository.createQueryBuilder();
      const mockResult = [{ id: 'log-1' }];
      
      mockQueryBuilder.getMany.mockResolvedValue(mockResult);
      
      const result = await service.findWithFilters(filters);
      
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(4);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('log.timestamp', 'DESC');
      expect(result).toEqual(mockResult);
    });
  });
});
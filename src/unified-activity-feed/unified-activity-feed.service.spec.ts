import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityFeedItem, ActivityFeedType } from './entities/activity-feed-item.entity';
import { Repository } from 'typeorm';

describe('UnifiedActivityFeedService', () => {
  let service: UnifiedActivityFeedService;
  let repository: Repository<ActivityFeedItem>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedActivityFeedService,
        {
          provide: getRepositoryToken(ActivityFeedItem),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UnifiedActivityFeedService>(UnifiedActivityFeedService);
    repository = module.get<Repository<ActivityFeedItem>>(getRepositoryToken(ActivityFeedItem));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('append', () => {
    it('should create and save a new ActivityFeedItem', async () => {
      const mockItem = {
        id: '123',
        userId: 'user-1',
        type: ActivityFeedType.NEW_DEVICE_LOGIN,
        referenceId: null,
        referenceType: null,
      };

      mockRepository.create.mockReturnValue(mockItem);
      mockRepository.save.mockResolvedValue(mockItem);

      const result = await service.append('user-1', ActivityFeedType.NEW_DEVICE_LOGIN);

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: ActivityFeedType.NEW_DEVICE_LOGIN,
        referenceId: null,
        referenceType: null,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockItem);
      expect(result).toEqual(mockItem);
    });
  });

  describe('getFeed', () => {
    it('should query feed items and handle cursor pagination without cursor', async () => {
      const mockItems = [
        { id: '1', userId: 'user-1', type: ActivityFeedType.NEW_DEVICE_LOGIN, createdAt: new Date() },
      ];

      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockItems),
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.getFeed('user-1', undefined, 10);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('item');
      expect(queryBuilder.where).toHaveBeenCalledWith('item.userId = :userId', { userId: 'user-1' });
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle pagination when there are more items than the limit', async () => {
      const baseDate = new Date('2026-08-26T12:00:00.000Z');
      const mockItems = [
        { id: '2', userId: 'user-1', type: ActivityFeedType.NEW_DEVICE_LOGIN, createdAt: baseDate },
        { id: '1', userId: 'user-1', type: ActivityFeedType.TRANSACTION_COMPLETE, createdAt: new Date(baseDate.getTime() - 1000) },
      ];

      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockItems),
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // limit of 1 should trigger "hasMore" because mockItems contains 2 items
      const result = await service.getFeed('user-1', undefined, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('2');
      expect(result.nextCursor).toBeDefined();
      
      const decodedCursor = Buffer.from(result.nextCursor!, 'base64').toString('ascii');
      expect(decodedCursor).toBe(`${baseDate.toISOString()}|2`);
    });
  });
});

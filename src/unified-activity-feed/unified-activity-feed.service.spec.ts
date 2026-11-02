jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: {
      forFeature: jest.fn(),
      forRoot: jest.fn(),
    },
  };
});

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => undefined;
  return {
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiQuery: noop,
    ApiResponse: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
  };
});

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';
import { UnifiedActivityFeedController } from './unified-activity-feed.controller';
import {
  ActivityFeedItem,
  ActivityFeedType,
} from './entities/activity-feed-item.entity';
import { IntelligentSmsRoutingController } from '../intelligent-sms-routing/intelligent-sms-routing.controller';

describe('UnifiedActivityFeedService & Controller (#1525)', () => {
  let service: UnifiedActivityFeedService;
  let controller: UnifiedActivityFeedController;
  let repository: Repository<ActivityFeedItem>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnifiedActivityFeedController],
      providers: [
        UnifiedActivityFeedService,
        {
          provide: getRepositoryToken(ActivityFeedItem),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UnifiedActivityFeedService>(
      UnifiedActivityFeedService,
    );
    controller = module.get<UnifiedActivityFeedController>(
      UnifiedActivityFeedController,
    );
    repository = module.get<Repository<ActivityFeedItem>>(
      getRepositoryToken(ActivityFeedItem),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
    expect(repository).toBeDefined();
  });

  describe('route versioning metadata', () => {
    it('configures UnifiedActivityFeedController at /v2/unified-activity-feed instead of /v1/v2/...', () => {
      const path = Reflect.getMetadata(
        PATH_METADATA,
        UnifiedActivityFeedController,
      );
      const version = Reflect.getMetadata(
        VERSION_METADATA,
        UnifiedActivityFeedController,
      );
      expect(path).toBe('unified-activity-feed');
      expect(version).toBe('2');
    });

    it('configures IntelligentSmsRoutingController at /v2/intelligent-sms-routing instead of /v1/v2/...', () => {
      const path = Reflect.getMetadata(
        PATH_METADATA,
        IntelligentSmsRoutingController,
      );
      const version = Reflect.getMetadata(
        VERSION_METADATA,
        IntelligentSmsRoutingController,
      );
      expect(path).toBe('intelligent-sms-routing');
      expect(version).toBe('2');
    });
  });

  describe('append', () => {
    it('should create and save a new ActivityFeedItem', async () => {
      const mockItem = {
        id: '00000000-0000-4000-8000-000000000123',
        userId: 'user-1',
        type: ActivityFeedType.NEW_DEVICE_LOGIN,
        referenceId: null,
        referenceType: null,
      };

      mockRepository.create.mockReturnValue(mockItem);
      mockRepository.save.mockResolvedValue(mockItem);

      const result = await service.append(
        'user-1',
        ActivityFeedType.NEW_DEVICE_LOGIN,
      );

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

  describe('getFeed validation (400 BadRequestException)', () => {
    it('returns 400 BadRequestException when ?limit=abc is passed to the controller', async () => {
      await expect(
        controller.getFeed(
          { user: { userId: 'user-1' } },
          { limit: 'abc' as unknown as number },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getFeed({ user: { userId: 'user-1' } }, undefined, 'abc'),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns 400 BadRequestException for out-of-range limits (0, -5, 101)', async () => {
      await expect(
        controller.getFeed({ user: { userId: 'user-1' } }, { limit: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getFeed({ user: { userId: 'user-1' } }, { limit: -5 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getFeed({ user: { userId: 'user-1' } }, { limit: 101 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 400 BadRequestException for malformed cursors (invalid base64, non-UUID id, invalid date)', async () => {
      const nonUuidCursor = Buffer.from('1756209600000000|not-a-uuid').toString(
        'base64',
      );
      const invalidDateCursor = Buffer.from(
        'not-a-timestamp|00000000-0000-4000-8000-000000000001',
      ).toString('base64');
      const missingSeparatorCursor =
        Buffer.from('just-one-part').toString('base64');

      await expect(
        service.getFeed('user-1', '!!!not-base64!!!', 10),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getFeed('user-1', nonUuidCursor, 10),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getFeed('user-1', invalidDateCursor, 10),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getFeed('user-1', missingSeparatorCursor, 10),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFeed pagination & same-millisecond microsecond cursor precision', () => {
    it('queries feed items and returns null nextCursor when items fit in limit', async () => {
      const mockItems = [
        {
          id: '00000000-0000-4000-8000-000000000001',
          userId: 'user-1',
          type: ActivityFeedType.NEW_DEVICE_LOGIN,
          createdAt: new Date(),
        },
      ];

      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockItems),
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.getFeed('user-1', undefined, 10);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('item');
      expect(queryBuilder.where).toHaveBeenCalledWith('item.userId = :userId', {
        userId: 'user-1',
      });
      expect(result.items).toEqual(mockItems);
      expect(result.nextCursor).toBeNull();
    });

    it('pages through 3 items inserted in the same millisecond and returns all 3 without dropping any', async () => {
      const sameMsDate = new Date('2026-08-26T12:00:00.123Z');
      const baseUs = BigInt(sameMsDate.getTime()) * 1000n;

      // 3 items inserted within the exact same millisecond (12:00:00.123900, .123500, .123100)
      const dataset = [
        {
          entity: {
            id: '00000000-0000-4000-8000-000000000003',
            userId: 'user-1',
            type: ActivityFeedType.NEW_DEVICE_LOGIN,
            referenceId: null,
            referenceType: null,
            createdAt: sameMsDate,
          },
          us: baseUs + 900n,
        },
        {
          entity: {
            id: '00000000-0000-4000-8000-000000000002',
            userId: 'user-1',
            type: ActivityFeedType.KYC_DECISION,
            referenceId: 'kyc-1',
            referenceType: 'kyc',
            createdAt: sameMsDate,
          },
          us: baseUs + 500n,
        },
        {
          entity: {
            id: '00000000-0000-4000-8000-000000000001',
            userId: 'user-1',
            type: ActivityFeedType.TRANSACTION_COMPLETE,
            referenceId: 'tx-1',
            referenceType: 'transaction',
            createdAt: sameMsDate,
          },
          us: baseUs + 100n,
        },
      ];

      mockRepository.createQueryBuilder.mockImplementation(() => {
        let limitVal = 10;
        let cursorFilter: { cursorUs: bigint; cursorId: string } | null = null;

        const qb: any = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          limit: jest.fn((n: number) => {
            limitVal = n;
            return qb;
          }),
          andWhere: jest.fn((_sql: string, params: Record<string, any>) => {
            cursorFilter = {
              cursorUs: BigInt(params.cursorUs),
              cursorId: params.cursorId,
            };
            return qb;
          }),
          getRawAndEntities: jest.fn(async () => {
            const filtered = dataset.filter((row) => {
              if (!cursorFilter) return true;
              return (
                row.us < cursorFilter.cursorUs ||
                (row.us === cursorFilter.cursorUs &&
                  row.entity.id < cursorFilter.cursorId)
              );
            });
            const sliced = filtered.slice(0, limitVal);
            return {
              entities: sliced.map((r) => r.entity),
              raw: sliced.map((r) => ({
                item_created_at_us: r.us.toString(),
              })),
            };
          }),
        };
        return qb;
      });

      const page1 = await service.getFeed('user-1', undefined, 1);
      expect(page1.items).toHaveLength(1);
      expect(page1.items[0].id).toBe('00000000-0000-4000-8000-000000000003');
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await service.getFeed('user-1', page1.nextCursor!, 1);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].id).toBe('00000000-0000-4000-8000-000000000002');
      expect(page2.nextCursor).not.toBeNull();

      const page3 = await service.getFeed('user-1', page2.nextCursor!, 1);
      expect(page3.items).toHaveLength(1);
      expect(page3.items[0].id).toBe('00000000-0000-4000-8000-000000000001');
      expect(page3.nextCursor).toBeNull();
    });
  });
});

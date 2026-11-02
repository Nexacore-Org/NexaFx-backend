jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const noop = () => () => {};
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    Entity: noop,
    PrimaryGeneratedColumn: noop,
    Column: noop,
    CreateDateColumn: noop,
    UpdateDateColumn: noop,
    ManyToOne: noop,
    OneToMany: noop,
    JoinColumn: noop,
    Index: noop,
  };
});

jest.mock('@nestjs/graphql', () => {
  const noop = () => () => {};
  return {
    GqlExecutionContext: { create: jest.fn() },
    ObjectType: noop,
    Field: noop,
    Int: Number,
    Float: Number,
    ID: String,
    registerEnumType: jest.fn(),
  };
});

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiResponse: noop,
    ApiParam: noop,
    ApiQuery: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/axios', () => ({
  HttpService: class HttpService {},
  HttpModule: class HttpModule {},
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
import {
  BadRequestException,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService, UserScreeningStatus } from './sanctions.service';
import { ListScreeningsQueryDto } from './dto/list-screenings-query.dto';
import {
  KycScreening,
  ScreeningProvider,
  ScreeningStatus,
} from './entities/kyc-screening.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('SanctionsController (#1492)', () => {
  let controller: SanctionsController;
  let service: jest.Mocked<
    Pick<
      SanctionsService,
      | 'getLatestScreening'
      | 'listScreenings'
      | 'overrideScreening'
      | 'screenUser'
      | 'syncOfacList'
    >
  >;

  beforeEach(async () => {
    service = {
      getLatestScreening: jest.fn(),
      listScreenings: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      overrideScreening: jest.fn(),
      screenUser: jest.fn(),
      syncOfacList: jest.fn().mockResolvedValue(42),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SanctionsController],
      providers: [
        {
          provide: SanctionsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SanctionsController>(SanctionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /v2/sanctions/me (getMyScreening)', () => {
    it('calls sanctionsService.getLatestScreening and never includes matches, score, overrideReason, or overriddenBy', async () => {
      const createdAt = new Date('2026-10-18T00:00:00.000Z');
      const fullEntity: KycScreening = {
        id: '22222222-2222-4222-8222-222222222222',
        userId: 'user1',
        user: {} as any,
        fullName: 'Sanctioned Person',
        dateOfBirth: '1980-01-01',
        nationality: 'US',
        score: 95,
        status: ScreeningStatus.BLOCKED,
        provider: ScreeningProvider.OPEN_SANCTIONS,
        matches: [
          { name: 'Watchlist Entry', dataset: 'us_ofac_sdn', score: 95 },
        ],
        overriddenBy: 'admin-uuid',
        overrideReason: 'Internal compliance note',
        overriddenAt: null,
        createdAt,
      };
      service.getLatestScreening.mockResolvedValue(fullEntity);

      const req = { user: { userId: 'user1' } };
      const result = await controller.getMyScreening(req as any);

      expect(service.getLatestScreening).toHaveBeenCalledWith('user1');
      expect(result).toEqual({
        status: UserScreeningStatus.UNDER_REVIEW,
        updatedAt: createdAt,
      });
      expect(result).not.toHaveProperty('matches');
      expect(result).not.toHaveProperty('score');
      expect(result).not.toHaveProperty('overrideReason');
      expect(result).not.toHaveProperty('overriddenBy');
      expect(result).not.toHaveProperty('provider');
    });

    it('returns VERIFIED and strips override fields when screening is CLEAR', async () => {
      const overriddenAt = new Date('2026-10-18T12:00:00.000Z');
      service.getLatestScreening.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        userId: 'user1',
        user: {} as any,
        fullName: 'Jane Doe',
        dateOfBirth: null,
        nationality: null,
        score: 80,
        status: ScreeningStatus.CLEAR,
        provider: ScreeningProvider.OFAC,
        matches: [{ name: 'Possible Hit', score: 80 }],
        overriddenBy: 'admin-id',
        overrideReason: 'Verified false positive via passport',
        overriddenAt,
        createdAt: new Date('2026-10-18T10:00:00.000Z'),
      });

      const result = await controller.getMyScreening({
        userId: 'user1',
        email: 'user1@example.com',
        role: 'USER',
      });

      expect(result).toEqual({
        status: UserScreeningStatus.VERIFIED,
        updatedAt: overriddenAt,
      });
      expect((result as any).matches).toBeUndefined();
      expect((result as any).score).toBeUndefined();
      expect((result as any).overrideReason).toBeUndefined();
      expect((result as any).overriddenBy).toBeUndefined();
    });
  });

  describe('GET /admin/sanctions/screenings (listScreenings)', () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    it('calls sanctionsService.listScreenings with the correct parameters', async () => {
      await controller.listScreenings({
        status: ScreeningStatus.BLOCKED,
        page: 2,
        limit: 50,
      });
      expect(service.listScreenings).toHaveBeenCalledWith(
        ScreeningStatus.BLOCKED,
        2,
        50,
      );
    });

    it('rejects invalid status=FOO with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          { status: 'FOO' },
          { type: 'query', metatype: ListScreeningsQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.listScreenings({ status: 'FOO' as any }),
      ).rejects.toThrow(BadRequestException);
      expect(service.listScreenings).not.toHaveBeenCalled();
    });

    it('rejects limit > 100 with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          { limit: '101' },
          { type: 'query', metatype: ListScreeningsQueryDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(controller.listScreenings({ limit: 101 })).rejects.toThrow(
        BadRequestException,
      );
      expect(service.listScreenings).not.toHaveBeenCalled();
    });

    it('rejects page < 1 with 400 BadRequestException', async () => {
      await expect(controller.listScreenings({ page: 0 })).rejects.toThrow(
        BadRequestException,
      );
      expect(service.listScreenings).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/sanctions/screenings/:id/override (overrideScreening)', () => {
    it('calls sanctionsService.overrideScreening with the correct parameters', async () => {
      const screeningId = '33333333-3333-4333-8333-333333333333';
      const req = { user: { userId: 'admin1' } };
      const dto = { reason: 'Confirmed false positive' };
      await controller.overrideScreening(screeningId, dto, req as any);
      expect(service.overrideScreening).toHaveBeenCalledWith(
        screeningId,
        'admin1',
        'Confirmed false positive',
      );
    });

    it('rejects non-UUID :id (not-a-uuid) with 400 BadRequestException', async () => {
      const pipe = new ParseUUIDPipe();
      await expect(
        pipe.transform('not-a-uuid', { type: 'param', data: 'id' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.overrideScreening(
          'not-a-uuid',
          { reason: 'Confirmed false positive' },
          { userId: 'admin1', email: 'a@b.c', role: 'SUPER_ADMIN' },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(service.overrideScreening).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/sanctions/screen/:userId (screenUser)', () => {
    it('calls sanctionsService.screenUser with the correct userId', async () => {
      const userId = '44444444-4444-4444-8444-444444444444';
      await controller.screenUser(userId);
      expect(service.screenUser).toHaveBeenCalledWith(userId);
    });

    it('rejects non-UUID :userId (not-a-uuid) with 400 BadRequestException', async () => {
      const pipe = new ParseUUIDPipe();
      await expect(
        pipe.transform('not-a-uuid', { type: 'param', data: 'userId' }),
      ).rejects.toThrow(BadRequestException);

      await expect(controller.screenUser('not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
      expect(service.screenUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/sanctions/sync-ofac (syncOfac)', () => {
    it('calls sanctionsService.syncOfacList', async () => {
      const res = await controller.syncOfac();
      expect(service.syncOfacList).toHaveBeenCalled();
      expect(res).toEqual({ synced: 42 });
    });
  });
});

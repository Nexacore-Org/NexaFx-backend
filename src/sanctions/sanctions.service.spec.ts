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

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SanctionsService, UserScreeningStatus } from './sanctions.service';
import {
  KycScreening,
  ScreeningProvider,
  ScreeningStatus,
} from './entities/kyc-screening.entity';
import { User } from '../users/user.entity';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('SanctionsService (#1492)', () => {
  let service: SanctionsService;
  let auditLogsService: { createLog: jest.Mock; log: jest.Mock };

  beforeEach(async () => {
    auditLogsService = {
      createLog: jest.fn().mockResolvedValue(undefined),
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SanctionsService,
        {
          provide: getRepositoryToken(KycScreening),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((dto) => ({ id: 'screening-1', ...dto })),
            save: jest.fn(async (entity) => entity),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: OpenSanctionsProvider,
          useValue: {
            screen: jest.fn(),
          },
        },
        {
          provide: OfacProvider,
          useValue: {
            screen: jest.fn(),
            syncFromTreasury: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
      ],
    }).compile();

    service = module.get<SanctionsService>(SanctionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('screenUser', () => {
    it('should fail-closed (return ERROR) if a provider fails', async () => {
      (service as any).userRepo.findOne.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
      });
      (service as any).openSanctions.screen.mockResolvedValue({
        matches: [],
        failed: true,
      });
      (service as any).ofac.screen.mockResolvedValue({
        matches: [],
        failed: false,
      });

      const screening = await service.screenUser('user1');
      expect(screening.status).toBe(ScreeningStatus.ERROR);
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SANCTIONS_SCREEN_USER',
          userId: 'user1',
        }),
      );
    });

    it('should flag a known-sanctioned test fixture', async () => {
      (service as any).userRepo.findOne.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
      });
      (service as any).openSanctions.screen.mockResolvedValue({
        matches: [{ score: 99 }],
        failed: false,
      });
      const screening = await service.screenUser('user1', 'admin-actor');
      expect(screening.status).toBe(ScreeningStatus.BLOCKED);
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-actor',
          userId: 'user1',
          action: 'SANCTIONS_SCREEN_USER',
        }),
      );
    });

    it('should clear a clean test fixture', async () => {
      (service as any).userRepo.findOne.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
      });
      (service as any).openSanctions.screen.mockResolvedValue({
        matches: [],
        failed: false,
      });
      (service as any).ofac.screen.mockResolvedValue({
        matches: [],
        failed: false,
      });
      const screening = await service.screenUser('user1');
      expect(screening.status).toBe(ScreeningStatus.CLEAR);
    });
  });

  describe('overrideScreening', () => {
    it('should record who overrode a flagged match, why, and create an audit log', async () => {
      const screening = {
        id: 'screening1',
        userId: 'user1',
        status: ScreeningStatus.BLOCKED,
      };
      (service as any).screeningRepo.findOne.mockResolvedValue(screening);

      await service.overrideScreening('screening1', 'admin1', 'False positive');

      expect((service as any).screeningRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ScreeningStatus.CLEAR,
          overriddenBy: 'admin1',
          overrideReason: 'False positive',
        }),
      );
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin1',
          userId: 'user1',
          action: 'SANCTIONS_SCREENING_OVERRIDE',
          entityId: 'screening1',
          metadata: expect.objectContaining({
            previousStatus: ScreeningStatus.BLOCKED,
            newStatus: ScreeningStatus.CLEAR,
            reason: 'False positive',
            overriddenBy: 'admin1',
          }),
        }),
      );
    });

    it('should reject overriding an ERROR screening and not create an audit log', async () => {
      const screening = {
        id: 'screening-err',
        userId: 'user1',
        status: ScreeningStatus.ERROR,
      };
      (service as any).screeningRepo.findOne.mockResolvedValue(screening);

      await expect(
        service.overrideScreening('screening-err', 'admin1', 'Provider outage'),
      ).rejects.toThrow(BadRequestException);

      expect((service as any).screeningRepo.save).not.toHaveBeenCalled();
      expect(auditLogsService.createLog).not.toHaveBeenCalled();
    });

    it('should throw an error if the screening is not found', async () => {
      (service as any).screeningRepo.findOne.mockResolvedValue(null);
      await expect(
        service.overrideScreening('screening1', 'admin1', 'reason'),
      ).rejects.toThrow(
        new NotFoundException('Screening screening1 not found'),
      );
    });

    it('should throw an error if the screening is already clear', async () => {
      const screening = { id: 'screening1', status: ScreeningStatus.CLEAR };
      (service as any).screeningRepo.findOne.mockResolvedValue(screening);
      await expect(
        service.overrideScreening('screening1', 'admin1', 'reason'),
      ).rejects.toThrow(new ForbiddenException('Screening is already CLEAR'));
    });
  });

  describe('getUserScreeningStatus / toUserFacingScreening', () => {
    it('strips matches, score, overrideReason, and overriddenBy from user-facing status', async () => {
      (service as any).screeningRepo.findOne.mockResolvedValue({
        id: 'screening1',
        userId: 'user1',
        score: 88,
        status: ScreeningStatus.WARNING,
        provider: ScreeningProvider.OPEN_SANCTIONS,
        matches: [{ name: 'PEP Match', score: 88 }],
        overriddenBy: 'admin1',
        overrideReason: 'Pending review',
        overriddenAt: null,
        createdAt: new Date('2026-10-18T00:00:00.000Z'),
      });

      const status = await service.getUserScreeningStatus('user1');
      expect(status).toEqual({
        status: UserScreeningStatus.UNDER_REVIEW,
        updatedAt: new Date('2026-10-18T00:00:00.000Z'),
      });
      expect(status).not.toHaveProperty('matches');
      expect(status).not.toHaveProperty('score');
      expect(status).not.toHaveProperty('overrideReason');
      expect(status).not.toHaveProperty('overriddenBy');
    });
  });

  describe('listScreenings', () => {
    it('rejects invalid status or out-of-range limit', async () => {
      await expect(service.listScreenings('FOO' as any, 1, 20)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.listScreenings(ScreeningStatus.CLEAR, 1, 101),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listScreenings(ScreeningStatus.CLEAR, 0, 20),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

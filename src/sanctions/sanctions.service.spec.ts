import { Test, TestingModule } from '@nestjs/testing';
import { SanctionsService } from './sanctions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KycScreening, ScreeningStatus } from './entities/kyc-screening.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('SanctionsService', () => {
  let service: SanctionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SanctionsService,
        {
          provide: getRepositoryToken(KycScreening),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KycRecord),
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
      ],
    }).compile();

    service = module.get<SanctionsService>(SanctionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('screenUser', () => {
    it('should fail-closed (return BLOCKED) if a provider fails', async () => {
      (service as any).kycRepo.findOne.mockResolvedValue({
        fullName: 'Test User',
      });
      (service as any).openSanctions.screen.mockRejectedValue(
        new Error('Provider timeout'),
      );

      const screening = await service.screenUser('user1');
      expect(screening.status).toBe(ScreeningStatus.BLOCKED);
    });

    it('should flag a known-sanctioned test fixture', async () => {
      (service as any).kycRepo.findOne.mockResolvedValue({
        fullName: 'Test User',
      });
      (service as any).openSanctions.screen.mockResolvedValue([{ score: 99 }]);
      const screening = await service.screenUser('user1');
      expect(screening.status).toBe(ScreeningStatus.BLOCKED);
    });

    it('should clear a clean test fixture', async () => {
      (service as any).kycRepo.findOne.mockResolvedValue({
        fullName: 'Test User',
      });
      (service as any).openSanctions.screen.mockResolvedValue([]);
      (service as any).ofac.screen.mockResolvedValue([]);
      const screening = await service.screenUser('user1');
      expect(screening.status).toBe(ScreeningStatus.CLEAR);
    });
  });

  describe('overrideScreening', () => {
    it('should record who overrode a flagged match and why', async () => {
      const screening = { id: 'screening1', status: ScreeningStatus.BLOCKED };
      (service as any).screeningRepo.findOne.mockResolvedValue(screening);
      await service.overrideScreening('screening1', 'admin1', 'False positive');
      expect((service as any).screeningRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          overriddenBy: 'admin1',
          overrideReason: 'False positive',
        }),
      );
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
});

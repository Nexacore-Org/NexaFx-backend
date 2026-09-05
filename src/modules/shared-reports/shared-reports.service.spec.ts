import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoneException, NotFoundException } from '@nestjs/common';
import { SharedReportsService } from './shared-reports.service';
import { CreateSharedReportDto } from './dto/shared-report.dto';

const DEFAULT_DTO: CreateSharedReportDto = {
  userId: 'user-1',
  reportType: 'INCOME_SUMMARY',
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
};

describe('SharedReportsService', () => {
  let service: SharedReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedReportsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-signing-key') },
        },
      ],
    }).compile();

    service = module.get<SharedReportsService>(SharedReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('returns a share token and url for the report', () => {
      const result = service.generate(DEFAULT_DTO);

      expect(result.shareToken).toBeTruthy();
      expect(result.shareUrl).toContain(`/report/${result.shareToken}`);
    });

    it('stores a report with the creator scoping and a verification hash', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);
      const report = service.listForUser('user-1')[0];

      expect(report.shareToken).toBe(shareToken);
      expect(report.userId).toBe('user-1');
      expect(report.reportType).toBe('INCOME_SUMMARY');
      expect(report.fromDate).toBe('2026-01-01');
      expect(report.toDate).toBe('2026-01-31');
      expect(report.isActive).toBe(true);
      expect(report.viewCount).toBe(0);
      expect(report.verificationHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('listForUser', () => {
    it('returns only reports belonging to the requested user', () => {
      service.generate({ ...DEFAULT_DTO, userId: 'user-1' });
      service.generate({ ...DEFAULT_DTO, userId: 'user-2' });

      const forUser1 = service.listForUser('user-1');
      const forUser2 = service.listForUser('user-2');

      expect(forUser1).toHaveLength(1);
      expect(forUser1[0].userId).toBe('user-1');
      expect(forUser2).toHaveLength(1);
      expect(forUser2[0].userId).toBe('user-2');
    });
  });

  describe('deactivate', () => {
    it('throws NotFoundException for an unknown report id', () => {
      expect(() => service.deactivate('missing')).toThrow(NotFoundException);
    });

    it('deactivates the report so it is no longer publicly accessible', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);
      const [report] = service.listForUser('user-1');

      service.deactivate(report.id);
      expect(report.isActive).toBe(false);

      expect(() => service.getPublic(shareToken)).toThrow(NotFoundException);
    });
  });

  describe('extend', () => {
    it('throws NotFoundException for an unknown report id', () => {
      expect(() => service.extend('missing')).toThrow(NotFoundException);
    });

    it('extends the expiry by approximately 30 days', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);
      const [report] = service.listForUser('user-1');
      const before = report.expiresAt.getTime();

      const extended = service.extend(report.id);

      const deltaDays =
        (extended.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(deltaDays).toBeGreaterThanOrEqual(29.99);
      expect(deltaDays).toBeLessThanOrEqual(30.01);
      expect(shareToken).toBeTruthy();
    });
  });

  describe('getPublic', () => {
    it('exposes only anonymised report data, never creator identity', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);

      const payload = service.getPublic(shareToken);

      expect(payload).toEqual({
        reportType: 'INCOME_SUMMARY',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        viewCount: 1,
        verificationHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        data: { totalReceived: 0, totalSent: 0, net: 0, topCurrencies: [] },
      });
      // No accidental leakage of unrelated account data.
      expect(payload).not.toHaveProperty('userId');
      expect(payload).not.toHaveProperty('shareToken');
      expect(payload).not.toHaveProperty('id');
      expect(payload).not.toHaveProperty('isActive');
    });

    it('increments the view count for each access', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);

      service.getPublic(shareToken);
      const secondView = service.getPublic(shareToken);

      expect(secondView.viewCount).toBe(2);
    });

    it('throws GoneException once the link has expired', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const { shareToken } = service.generate(DEFAULT_DTO);
      // 30-day expiry passes.
      jest.setSystemTime(new Date('2026-02-05T00:00:00Z'));

      expect(() => service.getPublic(shareToken)).toThrow(GoneException);
      jest.useRealTimers();
    });

    it('returns the anonymised history shape for TRANSACTION_HISTORY', () => {
      const { shareToken } = service.generate({
        ...DEFAULT_DTO,
        reportType: 'TRANSACTION_HISTORY',
      });

      const payload = service.getPublic(shareToken);

      expect(payload.data).toEqual({ transactions: [] });
    });

    it('returns the anonymised snapshot shape for PORTFOLIO_SNAPSHOT', () => {
      const { shareToken } = service.generate({
        ...DEFAULT_DTO,
        reportType: 'PORTFOLIO_SNAPSHOT',
      });

      const payload = service.getPublic(shareToken);

      expect(payload.data).toEqual({ totalValue: 0, breakdown: [] });
    });
  });

  describe('verifyHash', () => {
    it('throws NotFoundException for an unknown token', () => {
      expect(() => service.verifyHash('missing', 'abc')).toThrow(
        NotFoundException,
      );
    });

    it('confirms a matching verification hash', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);
      const [report] = service.listForUser('user-1');

      expect(
        service.verifyHash(shareToken, report.verificationHash).valid,
      ).toBe(true);
    });

    it('rejects a mismatching verification hash', () => {
      const { shareToken } = service.generate(DEFAULT_DTO);

      expect(service.verifyHash(shareToken, 'wrong-hash').valid).toBe(false);
    });
  });
});

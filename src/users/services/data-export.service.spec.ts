import { ConflictException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DataExportService } from './data-export.service';
import {
  DataRequestStatus,
  DataRequestType,
} from '../entities/data-request.entity';

jest.mock('archiver', () => jest.fn());

describe('DataExportService', () => {
  const dataRequestRepository = {
    findOne: jest.fn(),
    create: jest.fn((input: unknown) => input),
    save: jest.fn(async (entity: unknown) => entity),
    find: jest.fn(),
  };
  const userRepository = { findOne: jest.fn() };
  const transactionRepository = { find: jest.fn() };
  const notificationRepository = { create: jest.fn(), find: jest.fn() };
  const kycRepository = { find: jest.fn() };
  const beneficiaryRepository = { find: jest.fn() };
  const auditLogRepository = { find: jest.fn() };
  const walletRepository = { find: jest.fn() };

  const build = (): DataExportService => {
    const instance = Object.create(
      DataExportService.prototype,
    ) as DataExportService;
    const deps = {
      dataRequestRepository,
      userRepository,
      transactionRepository,
      notificationRepository,
      kycRepository,
      beneficiaryRepository,
      auditLogRepository,
      walletRepository,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      EXPORT_DIR: path.join(os.tmpdir(), 'nexafx-export-spec'),
      EXPORT_EXPIRY_HOURS: 24,
    };
    for (const [key, value] of Object.entries(deps)) {
      (instance as unknown as Record<string, unknown>)[key] = value;
    }
    fs.mkdirSync(path.join(os.tmpdir(), 'nexafx-export-spec'), {
      recursive: true,
    });
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    fs.rmSync(path.join(os.tmpdir(), 'nexafx-export-spec'), {
      recursive: true,
      force: true,
    });
  });

  describe('in-progress check', () => {
    it('only considers EXPORT requests, so a pending deletion does not block it', async () => {
      const service = build();
      userRepository.findOne.mockResolvedValue({ id: 'user-1' });
      dataRequestRepository.findOne.mockResolvedValue(null);
      dataRequestRepository.save.mockImplementation(async (r) => r);

      await service.requestDataExport('user-1');

      expect(dataRequestRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: DataRequestType.EXPORT }),
        }),
      );
    });

    it('still rejects a duplicate export', async () => {
      const service = build();
      userRepository.findOne.mockResolvedValue({ id: 'user-1' });
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'other',
        status: DataRequestStatus.PENDING,
      });

      await expect(service.requestDataExport('user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getExportFilePath', () => {
    it('returns null for another users request', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getExportFilePath('req-1', 'user-2'),
      ).resolves.toBeNull();
    });

    it('returns null for an incomplete request', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'req-1',
        status: DataRequestStatus.PENDING,
      });

      await expect(
        service.getExportFilePath('req-1', 'user-1'),
      ).resolves.toBeNull();
    });

    it('returns null for an expired request', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'req-1',
        status: DataRequestStatus.COMPLETE,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.getExportFilePath('req-1', 'user-1'),
      ).resolves.toBeNull();
    });

    it('resolves the archive for a completed, unexpired request', async () => {
      const service = build();
      const dir = path.join(os.tmpdir(), 'nexafx-export-spec');
      fs.writeFileSync(path.join(dir, 'nexafx-export_user-1_2026-01-01.zip'), 'x');
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'req-1',
        status: DataRequestStatus.COMPLETE,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.getExportFilePath('req-1', 'user-1');

      expect(result).toContain('nexafx-export_user-1_2026-01-01.zip');
    });
  });

  describe('cleanupExpiredExports', () => {
    it('removes archives older than the expiry window', () => {
      const service = build();
      const dir = path.join(os.tmpdir(), 'nexafx-export-spec');
      const stale = path.join(dir, 'nexafx-export_user-9_2020-01-01.zip');
      const fresh = path.join(dir, 'nexafx-export_user-8_2026-01-01.zip');
      fs.writeFileSync(stale, 'x');
      fs.writeFileSync(fresh, 'x');
      const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
      fs.utimesSync(stale, old, old);

      const result = service.cleanupExpiredExports();

      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(stale)).toBe(false);
    });
  });
});

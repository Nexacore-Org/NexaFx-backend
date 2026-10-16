import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountDeletionService } from './account-deletion.service';
import { DataRequest, DataRequestType, DataRequestStatus } from '../entities/data-request.entity';

describe('AccountDeletionService', () => {
  const dataRequestRepository = {
    findOne: jest.fn(),
    create: jest.fn((input: Partial<DataRequest>) => input),
    save: jest.fn(async (entity: Partial<DataRequest>) => entity),
    find: jest.fn(),
  };
  const userRepository = { findOne: jest.fn() };
  const transactionRepository = { find: jest.fn(), delete: jest.fn() };
  const refreshTokensService = { revokeAllUserTokens: jest.fn() };
  const usersService = { findById: jest.fn(), softDelete: jest.fn() };
  const notificationsService = { create: jest.fn() };
  const dataSource = {
    transaction: jest.fn(),
    createQueryRunner: jest.fn(),
  } as unknown as DataSource;

  const build = (): AccountDeletionService => {
    const instance = Object.create(
      AccountDeletionService.prototype,
    ) as AccountDeletionService;
    const deps = {
      dataRequestRepository,
      userRepository,
      transactionRepository,
      refreshTokensService,
      usersService,
      notificationsService,
      dataSource,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
      HARD_DELETE_DAYS: 30,
    };
    for (const [key, value] of Object.entries(deps)) {
      (instance as unknown as Record<string, unknown>)[key] = value;
    }
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dataRequestRepository.save.mockImplementation(
      async (entity: Partial<DataRequest>) => entity,
    );
  });

  describe('requestAccountDeletion', () => {
    it('creates a pending deletion request', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue(null);
      usersService.findById.mockResolvedValue({ id: 'user-1' });

      const result = await service.requestAccountDeletion('user-1');

      expect(result.type).toBe(DataRequestType.DELETION);
      expect(result.status).toBe(DataRequestStatus.PENDING);
    });

    it('returns 409 when a request is already in progress', async () => {
      const service = build();
      dataRequestRepository.findOne.mockResolvedValue({
        id: 'existing',
        status: DataRequestStatus.PROCESSING,
      });

      await expect(service.requestAccountDeletion('user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('anonymizeUserAccount', () => {
    it('targets the RefreshToken entity rather than a table name', async () => {
      const service = build();
      const update = jest.fn();
      const del = jest.fn();
      const save = jest.fn();
      const queryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { update, delete: del, save },
      };
      (dataSource.createQueryRunner as jest.Mock).mockResolvedValue(queryRunner);
      userRepository.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        balances: { XLM: 1 },
        isSuspended: false,
        isDeleted: false,
      });

      await service.anonymizeUserAccount('user-1');

      const updateTargets = update.mock.calls.map((call) => call[0]);
      expect(updateTargets.some((target: unknown) => typeof target === 'string')).toBe(
        false,
      );
      expect(updateTargets.length).toBeGreaterThan(0);
    });
  });
});

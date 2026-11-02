import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VaultsService } from '../vaults.service';
import { SavingsVault } from '../entities/savings-vault.entity';
import { VaultTransaction } from '../entities/vault-transaction.entity';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CreateVaultDto,
  MAX_VAULT_TERM_DAYS,
} from '../dto/create-vault.dto';
import { VaultStatus } from '../enum/vault-status.enum';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';
import { User } from '../../users/user.entity';

describe('VaultsService', () => {
  let service: VaultsService;
  let vaultRepository: Repository<SavingsVault>;
  let usersService: { findById: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const futureDate = (daysAhead = 30): string =>
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(async () => {
    usersService = {
      findById: jest.fn(),
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === SavingsVault) {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: 'vaultId',
                  status: VaultStatus.ACTIVE,
                  currentBalance: '0',
                }),
                save: jest.fn(),
              };
            }
            if (entity === VaultTransaction) {
              return {
                create: jest.fn((dto) => dto),
                save: jest.fn(),
                find: jest.fn().mockResolvedValue([]),
              };
            }
            if (entity === User || entity?.name === 'User') {
              return {
                findOne: jest.fn(),
                update: jest.fn(),
              };
            }
          },
        };
        return callback(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultsService,
        {
          provide: getRepositoryToken(SavingsVault),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(VaultTransaction),
          useClass: Repository,
        },
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<VaultsService>(VaultsService);
    vaultRepository = module.get<Repository<SavingsVault>>(
      getRepositoryToken(SavingsVault),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createVault & CreateVaultDto validation', () => {
    it('should create a new vault for valid input', async () => {
      const dto: CreateVaultDto = {
        name: 'Test Vault',
        currency: 'USD',
        targetAmount: 1000,
        unlockAt: futureDate(30),
      };
      const userId = '1';

      jest
        .spyOn(vaultRepository, 'create')
        .mockImplementation((entity) => entity as SavingsVault);
      jest
        .spyOn(vaultRepository, 'save')
        .mockImplementation(async (entity) => ({
          id: 'v-1',
          currentBalance: '0',
          accruedInterest: '0',
          ...(entity as SavingsVault),
        }));

      const res = await service.createVault(userId, dto);

      expect(vaultRepository.create).toHaveBeenCalled();
      expect(vaultRepository.save).toHaveBeenCalled();
      expect(res.currency).toBe('USD');
    });

    it('rejects a past unlockAt date with 400 BadRequestException (and DTO validation error)', async () => {
      const pastIso = new Date(Date.now() - 60_000).toISOString();
      const raw = {
        name: 'Emergency Fund',
        currency: 'USD',
        targetAmount: 500,
        unlockAt: pastIso,
      };

      const errors = await validate(plainToInstance(CreateVaultDto, raw));
      expect(errors.some((e) => e.property === 'unlockAt')).toBe(true);

      await expect(service.createVault('user-1', raw)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an unlockAt date beyond MAX_VAULT_TERM_DAYS', async () => {
      const tooFarIso = futureDate(MAX_VAULT_TERM_DAYS + 10);
      const raw = {
        name: 'Long Vault',
        currency: 'USD',
        targetAmount: 500,
        unlockAt: tooFarIso,
      };

      const errors = await validate(plainToInstance(CreateVaultDto, raw));
      expect(errors.some((e) => e.property === 'unlockAt')).toBe(true);

      await expect(service.createVault('user-1', raw)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an unknown currency', async () => {
      const raw = {
        name: 'Unknown Currency Vault',
        currency: 'FAKECOIN',
        targetAmount: 500,
        unlockAt: futureDate(30),
      };

      const errors = await validate(plainToInstance(CreateVaultDto, raw));
      expect(errors.some((e) => e.property === 'currency')).toBe(true);

      await expect(service.createVault('user-1', raw)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects targetAmount <= 0', async () => {
      const raw = {
        name: 'Zero Target Vault',
        currency: 'NGN',
        targetAmount: 0,
        unlockAt: futureDate(30),
      };

      const errors = await validate(plainToInstance(CreateVaultDto, raw));
      expect(errors.some((e) => e.property === 'targetAmount')).toBe(true);

      await expect(service.createVault('user-1', raw)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty name or name longer than 255 characters', async () => {
      const overlongRaw = {
        name: 'A'.repeat(256),
        currency: 'USD',
        targetAmount: 100,
        unlockAt: futureDate(30),
      };

      const errors = await validate(
        plainToInstance(CreateVaultDto, overlongRaw),
      );
      expect(errors.some((e) => e.property === 'name')).toBe(true);

      await expect(service.createVault('user-1', overlongRaw)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.createVault('user-1', { ...overlongRaw, name: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires both autoDepositAmount and autoDepositFrequency or neither', async () => {
      const amountOnly: CreateVaultDto = {
        name: 'Half Auto 1',
        currency: 'USD',
        targetAmount: 1000,
        unlockAt: futureDate(30),
        autoDepositAmount: 50,
      };
      const freqOnly: CreateVaultDto = {
        name: 'Half Auto 2',
        currency: 'USD',
        targetAmount: 1000,
        unlockAt: futureDate(30),
        autoDepositFrequency: AutoDepositFrequency.DAILY,
      };

      const err1 = await validate(plainToInstance(CreateVaultDto, amountOnly));
      expect(err1.some((e) => e.property === 'autoDepositFrequency')).toBe(
        true,
      );

      const err2 = await validate(plainToInstance(CreateVaultDto, freqOnly));
      expect(err2.some((e) => e.property === 'autoDepositAmount')).toBe(true);

      await expect(service.createVault('user-1', amountOnly)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createVault('user-1', freqOnly)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('processAutoDeposits idempotency & locked balance check', () => {
    it('deposits only once when processAutoDeposits runs twice on the same UTC day', async () => {
      const vaultState: SavingsVault = {
        id: 'vault-auto-1',
        userId: 'user-auto-1',
        name: 'Daily Saver',
        currency: 'USD',
        targetAmount: '1000',
        currentBalance: '100',
        annualInterestRate: '0.05',
        accruedInterest: '0',
        unlockAt: new Date(Date.now() + 86_400_000 * 30),
        status: VaultStatus.ACTIVE,
        earlyWithdrawalPenaltyPercent: '0.10',
        autoDepositAmount: '25',
        autoDepositFrequency: AutoDepositFrequency.DAILY,
        lastInterestAccruedAt: null,
        lastAutoDepositAt: null,
        maturedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {} as User,
        transactions: [],
      };

      const userState: User = {
        id: 'user-auto-1',
        balances: { USD: 100 },
      } as unknown as User;

      jest
        .spyOn(vaultRepository, 'find')
        .mockImplementation(async () => [{ ...vaultState }]);

      const vaultSaveMock = jest
        .fn()
        .mockImplementation(async (updated: SavingsVault) => {
          Object.assign(vaultState, updated);
          return vaultState;
        });
      const txSaveMock = jest.fn().mockResolvedValue({});
      const userUpdateMock = jest
        .fn()
        .mockImplementation(async (_id: string, partial: Partial<User>) => {
          if (partial.balances) {
            userState.balances = { ...partial.balances };
          }
        });
      const userFindOneMock = jest
        .fn()
        .mockImplementation(async () => ({
          ...userState,
          balances: { ...userState.balances },
        }));

      dataSource.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === SavingsVault) {
              return {
                findOne: jest.fn().mockImplementation(async () => ({
                  ...vaultState,
                })),
                save: vaultSaveMock,
              };
            }
            if (entity === VaultTransaction) {
              return {
                create: jest.fn((dto) => dto),
                save: txSaveMock,
              };
            }
            if (entity === User || entity?.name === 'User') {
              return {
                findOne: userFindOneMock,
                update: userUpdateMock,
              };
            }
          },
        };
        return callback(manager);
      });

      // First run of the day
      await service.processAutoDeposits();

      expect(vaultState.currentBalance).toBe('125');
      expect(vaultState.lastAutoDepositAt).toBeInstanceOf(Date);
      expect(userState.balances.USD).toBe(75);
      expect(txSaveMock).toHaveBeenCalledTimes(1);
      expect(userFindOneMock).toHaveBeenCalledWith({
        where: { id: 'user-auto-1' },
        lock: { mode: 'pessimistic_write' },
      });

      // Second run on the same day must NOT deposit again
      await service.processAutoDeposits();

      expect(vaultState.currentBalance).toBe('125');
      expect(userState.balances.USD).toBe(75);
      expect(txSaveMock).toHaveBeenCalledTimes(1);
    });

    it('re-reads user balance under lock inside the transaction and skips when balance is insufficient', async () => {
      const vaultState: SavingsVault = {
        id: 'vault-auto-2',
        userId: 'user-auto-2',
        name: 'Low Balance Vault',
        currency: 'USD',
        targetAmount: '500',
        currentBalance: '0',
        annualInterestRate: '0.05',
        accruedInterest: '0',
        unlockAt: new Date(Date.now() + 86_400_000 * 30),
        status: VaultStatus.ACTIVE,
        earlyWithdrawalPenaltyPercent: '0.10',
        autoDepositAmount: '50',
        autoDepositFrequency: AutoDepositFrequency.DAILY,
        lastInterestAccruedAt: null,
        lastAutoDepositAt: null,
        maturedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {} as User,
        transactions: [],
      };

      jest.spyOn(vaultRepository, 'find').mockResolvedValue([vaultState]);

      const txSaveMock = jest.fn();
      const userUpdateMock = jest.fn();

      dataSource.transaction.mockImplementation(async (callback) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === SavingsVault) {
              return {
                findOne: jest.fn().mockResolvedValue({ ...vaultState }),
                save: jest.fn(),
              };
            }
            if (entity === VaultTransaction) {
              return {
                create: jest.fn((dto) => dto),
                save: txSaveMock,
              };
            }
            if (entity === User || entity?.name === 'User') {
              return {
                findOne: jest.fn().mockResolvedValue({
                  id: 'user-auto-2',
                  balances: { USD: 10 },
                }),
                update: userUpdateMock,
              };
            }
          },
        };
        return callback(manager);
      });

      await service.processAutoDeposits();

      expect(txSaveMock).not.toHaveBeenCalled();
      expect(userUpdateMock).not.toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-auto-2',
          title: 'Auto-Deposit Skipped',
        }),
      );
    });
  });

  describe('deleteVault', () => {
    const makeVault = (overrides: Partial<SavingsVault> = {}): SavingsVault =>
      ({
        id: 'vaultId',
        userId: 'userId',
        status: VaultStatus.CLOSED,
        currentBalance: '0',
        accruedInterest: '0',
        ...overrides,
      }) as SavingsVault;

    beforeEach(() => {
      jest.spyOn(vaultRepository, 'findOne').mockResolvedValue(makeVault());
      jest.spyOn(vaultRepository, 'remove').mockResolvedValue(makeVault());
    });

    it.each([
      ['CLOSED', VaultStatus.CLOSED],
      ['BROKEN', VaultStatus.BROKEN],
    ])('deletes an empty %s vault', async (_name, status) => {
      jest
        .spyOn(vaultRepository, 'findOne')
        .mockResolvedValue(makeVault({ status }));
      await service.deleteVault('userId', 'vaultId');

      expect(vaultRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ status }),
      );
    });

    it('rejects a MATURED vault and directs the user to withdraw first', async () => {
      jest
        .spyOn(vaultRepository, 'findOne')
        .mockResolvedValue(
          makeVault({ status: VaultStatus.MATURED, currentBalance: '100' }),
        );

      await expect(service.deleteVault('userId', 'vaultId')).rejects.toThrow(
        new UnprocessableEntityException(
          'Cannot delete a MATURED vault while it still holds funds. Withdraw funds first.',
        ),
      );
      expect(vaultRepository.remove).not.toHaveBeenCalled();
    });

    it.each([
      [
        'CLOSED',
        VaultStatus.CLOSED,
        'current balance',
        { currentBalance: '0.00000001' },
      ],
      [
        'CLOSED',
        VaultStatus.CLOSED,
        'accrued interest',
        { accruedInterest: '0.00000001' },
      ],
      [
        'BROKEN',
        VaultStatus.BROKEN,
        'current balance',
        { currentBalance: '0.00000001' },
      ],
      [
        'BROKEN',
        VaultStatus.BROKEN,
        'accrued interest',
        { accruedInterest: '0.00000001' },
      ],
    ])(
      'rejects a %s vault with nonzero %s',
      async (_name, status, _balanceName, balance) => {
        jest
          .spyOn(vaultRepository, 'findOne')
          .mockResolvedValue(makeVault({ status, ...balance }));

        await expect(service.deleteVault('userId', 'vaultId')).rejects.toThrow(
          UnprocessableEntityException,
        );
        expect(vaultRepository.remove).not.toHaveBeenCalled();
      },
    );

    it('rejects an ACTIVE vault', async () => {
      jest
        .spyOn(vaultRepository, 'findOne')
        .mockResolvedValue(makeVault({ status: VaultStatus.ACTIVE }));

      await expect(service.deleteVault('userId', 'vaultId')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(vaultRepository.remove).not.toHaveBeenCalled();
    });
  });
});

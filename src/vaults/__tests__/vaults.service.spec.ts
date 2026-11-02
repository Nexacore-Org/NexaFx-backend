jest.mock('@nestjs/typeorm', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: any) =>
    `${typeof entity === 'function' ? entity.name : String(entity)}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: { forFeature: () => ({}), forRoot: () => ({}) },
  };
});

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => {},
  ApiPropertyOptional: () => () => {},
  ApiTags: () => () => {},
  ApiOperation: () => () => {},
  ApiResponse: () => () => {},
  ApiBearerAuth: () => () => {},
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get = jest.fn();
  },
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => {},
  WebSocketServer: () => () => {},
  SubscribeMessage: () => () => {},
}));

jest.mock('../../firebase/fcm.service', () => ({
  FCMService: class FCMService {},
}));

jest.mock('../../modules/mail/mail.service', () => ({
  MailService: class MailService {},
}));

jest.mock('../../notifications/notifications.gateway', () => ({
  NotificationsGateway: class NotificationsGateway {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { VaultsService } from '../vaults.service';
import { SavingsVault } from '../entities/savings-vault.entity';
import { VaultTransaction } from '../entities/vault-transaction.entity';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { CreateVaultDto } from '../dto/create-vault.dto';
import { VaultStatus } from '../enum/vault-status.enum';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';

describe('VaultsService', () => {
  let service: VaultsService;
  let vaultRepository: Repository<SavingsVault>;

  beforeEach(async () => {
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
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation(async (callback) => {
              const manager = {
                getRepository: (entity) => {
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
                      create: jest.fn(),
                      save: jest.fn(),
                      find: jest.fn().mockResolvedValue([]),
                    };
                  }
                  if (entity.name === 'User') {
                    return {
                      update: jest.fn(),
                    };
                  }
                },
              };
              return callback(manager);
            }),
          },
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

  describe('createVault', () => {
    it('should create a new vault', async () => {
      const dto: CreateVaultDto = {
        name: 'Test Vault',
        currency: 'USD',
        targetAmount: 1000,
        unlockAt: new Date(),
      };
      const userId = '1';

      jest.spyOn(vaultRepository, 'create').mockReturnValue({} as SavingsVault);
      jest.spyOn(vaultRepository, 'save').mockResolvedValue({} as SavingsVault);

      await service.createVault(userId, dto);

      expect(vaultRepository.create).toHaveBeenCalled();
      expect(vaultRepository.save).toHaveBeenCalled();
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
      ['CLOSED', VaultStatus.CLOSED, 'current balance', { currentBalance: '0.00000001' }],
      ['CLOSED', VaultStatus.CLOSED, 'accrued interest', { accruedInterest: '0.00000001' }],
      ['BROKEN', VaultStatus.BROKEN, 'current balance', { currentBalance: '0.00000001' }],
      ['BROKEN', VaultStatus.BROKEN, 'accrued interest', { accruedInterest: '0.00000001' }],
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

  describe('notification types', () => {
    it('emits VAULT_MATURITY when a vault matures in processMaturity', async () => {
      const notificationsService = (service as any).notificationsService;
      const txRepository = (service as any).txRepository;

      jest.spyOn(vaultRepository, 'find').mockResolvedValue([
        {
          id: 'vault-mature-1',
          userId: 'user-1',
          name: 'Emergency Fund',
          currency: 'XLM',
          status: VaultStatus.ACTIVE,
          currentBalance: '100.00000000',
          accruedInterest: '5.00000000',
          unlockAt: new Date(Date.now() - 1000),
        } as SavingsVault,
      ]);
      jest
        .spyOn(vaultRepository, 'save')
        .mockImplementation(async (v) => v as SavingsVault);
      jest
        .spyOn(txRepository, 'create')
        .mockImplementation((dto: any) => dto as VaultTransaction);
      jest
        .spyOn(txRepository, 'save')
        .mockImplementation(async (tx: any) => tx as VaultTransaction);

      await service.processMaturity();

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.VAULT_MATURITY,
          relatedId: 'vault-mature-1',
        }),
      );
    });

    it('emits VAULT_AUTO_DEPOSIT_SKIPPED when auto-deposit is skipped due to insufficient balance', async () => {
      const notificationsService = (service as any).notificationsService;
      const usersService = (service as any).usersService;

      jest.spyOn(vaultRepository, 'find').mockResolvedValue([
        {
          id: 'vault-auto-1',
          userId: 'user-1',
          name: 'Daily Saver',
          currency: 'XLM',
          status: VaultStatus.ACTIVE,
          currentBalance: '50.00000000',
          autoDepositAmount: '25.00000000',
          autoDepositFrequency: AutoDepositFrequency.DAILY,
        } as SavingsVault,
      ]);
      usersService.findById.mockResolvedValue({
        id: 'user-1',
        balances: { XLM: 5 },
      });

      await service.processAutoDeposits();

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.VAULT_AUTO_DEPOSIT_SKIPPED,
          relatedId: 'vault-auto-1',
        }),
      );
    });
  });
});

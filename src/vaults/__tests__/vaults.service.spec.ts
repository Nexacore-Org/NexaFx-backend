import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { VaultsService } from '../vaults.service';
import { SavingsVault } from '../entities/savings-vault.entity';
import { VaultTransaction } from '../entities/vault-transaction.entity';
import { UsersService } from '../../users/users.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { CreateVaultDto } from '../dto/create-vault.dto';
import { VaultStatus } from '../enum/vault-status.enum';

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
});

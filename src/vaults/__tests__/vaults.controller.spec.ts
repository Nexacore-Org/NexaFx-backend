import { Test, TestingModule } from '@nestjs/testing';
import { VaultsController } from '../vaults.controller';
import { VaultsService } from '../vaults.service';
import { CreateVaultDto } from '../dto/create-vault.dto';
import { DepositDto } from '../dto/deposit.dto';

describe('VaultsController', () => {
  let controller: VaultsController;
  let service: VaultsService;

  const mockVaultsService = {
    createVault: jest.fn(),
    deposit: jest.fn(),
    withdraw: jest.fn(),
    listVaults: jest.fn(),
    getVaultDetail: jest.fn(),
    deleteVault: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaultsController],
      providers: [
        {
          provide: VaultsService,
          useValue: mockVaultsService,
        },
      ],
    }).compile();

    controller = module.get<VaultsController>(VaultsController);
    service = module.get<VaultsService>(VaultsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new vault', async () => {
      const dto: CreateVaultDto = {
        name: 'Test Vault',
        currency: 'USD',
        targetAmount: 1000,
        unlockAt: new Date(),
      };
      const req = { user: { userId: '1' } };
      await controller.create(req, dto);
      expect(service.createVault).toHaveBeenCalledWith(req.user.userId, dto);
    });
  });

  describe('deposit', () => {
    it('should deposit funds into a vault', async () => {
      const dto: DepositDto = { amount: 100 };
      const req = { user: { userId: '1' } };
      await controller.deposit(req, 'vault_id', dto);
      expect(service.deposit).toHaveBeenCalledWith(
        req.user.userId,
        'vault_id',
        dto.amount,
      );
    });
  });
});

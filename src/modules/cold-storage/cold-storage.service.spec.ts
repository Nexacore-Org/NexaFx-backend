import { Test, TestingModule } from '@nestjs/testing';
import { ColdStorageService } from './cold-storage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ColdStorageAccount } from './entities/cold-storage-account.entity';
import { ColdStorageWithdrawal } from './entities/cold-storage-withdrawal.entity';
import { StellarService } from '../blockchain/stellar.service';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Repository } from 'typeorm';

const mockColdStorageAccountRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockColdStorageWithdrawalRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockStellarService = {
  sendPayment: jest.fn(),
};

const mockWalletsService = {
  getBalance: jest.fn(),
};

const mockUsersService = {
  findOne: jest.fn(),
};

const mockAuditLogsService = {
  log: jest.fn(),
};

describe('ColdStorageService', () => {
  let service: ColdStorageService;
  let coldStorageAccountRepo: Repository<ColdStorageAccount>;
  let coldStorageWithdrawalRepo: Repository<ColdStorageWithdrawal>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ColdStorageService,
        {
          provide: getRepositoryToken(ColdStorageAccount),
          useValue: mockColdStorageAccountRepo,
        },
        {
          provide: getRepositoryToken(ColdStorageWithdrawal),
          useValue: mockColdStorageWithdrawalRepo,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: WalletsService,
          useValue: mockWalletsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: AuditLogsService,
          useValue: mockAuditLogsService,
        },
      ],
    }).compile();

    service = module.get<ColdStorageService>(ColdStorageService);
    coldStorageAccountRepo = module.get<Repository<ColdStorageAccount>>(
      getRepositoryToken(ColdStorageAccount),
    );
    coldStorageWithdrawalRepo = module.get<Repository<ColdStorageWithdrawal>>(
      getRepositoryToken(ColdStorageWithdrawal),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setup', () => {
    it('should create a new cold storage account', async () => {
      const user = { id: 'user-id', kycTier: 'ENHANCED' };
      const account = {
        id: 'account-id',
        userId: 'user-id',
        currency: 'USD',
        stellarPublicKey: 'G...',
      };
      mockUsersService.findOne.mockResolvedValue(user);
      mockColdStorageAccountRepo.findOne.mockResolvedValue(null);
      mockColdStorageAccountRepo.create.mockReturnValue(account);
      mockColdStorageAccountRepo.save.mockResolvedValue(account);

      const result = await service.setup('user-id', 'USD', 'G...');
      expect(result).toEqual(account);
      expect(mockAuditLogsService.log).toHaveBeenCalled();
    });

    it('should throw a ForbiddenException if KYC is not ENHANCED', async () => {
      const user = { id: 'user-id', kycTier: 'BASIC' };
      mockUsersService.findOne.mockResolvedValue(user);
      await expect(service.setup('user-id', 'USD', 'G...')).rejects.toThrow(
        'Enhanced KYC verification is required to set up a cold storage account',
      );
    });
  });

  describe('requestWithdrawal', () => {
    it('should create a withdrawal request', async () => {
      const account = {
        id: 'account-id',
        userId: 'user-id',
        balance: '1000.00',
        pendingWithdrawals: '0.00',
      };
      const withdrawal = {
        id: 'withdrawal-id',
        amount: '100.00',
        status: 'PENDING_APPROVAL',
      };
      mockColdStorageAccountRepo.findOne.mockResolvedValue(account);
      mockColdStorageWithdrawalRepo.create.mockReturnValue(withdrawal);
      mockColdStorageWithdrawalRepo.save.mockResolvedValue(withdrawal);
      mockColdStorageAccountRepo.save.mockResolvedValue({
        ...account,
        pendingWithdrawals: '100.00',
      });

      const result = await service.requestWithdrawal('user-id', '100.00');
      expect(result).toEqual(withdrawal);
      expect(mockAuditLogsService.log).toHaveBeenCalled();
    });

    it('should throw a BadRequestException for insufficient balance', async () => {
      const account = {
        id: 'account-id',
        userId: 'user-id',
        balance: '50.00',
        pendingWithdrawals: '0.00',
      };
      mockColdStorageAccountRepo.findOne.mockResolvedValue(account);
      await expect(
        service.requestWithdrawal('user-id', '100.00'),
      ).rejects.toThrow(
        'Insufficient available balance. Available: 50, Requested: 100',
      );
    });
  });

  describe('approveWithdrawal', () => {
    it('should approve a withdrawal request', async () => {
      const withdrawal = {
        id: 'withdrawal-id',
        status: 'PENDING_APPROVAL',
        save: jest.fn(),
      };
      mockColdStorageWithdrawalRepo.findOne.mockResolvedValue(withdrawal);
      mockColdStorageWithdrawalRepo.save.mockResolvedValue({
        ...withdrawal,
        status: 'WAITING_PERIOD',
      });

      const result = await service.approveWithdrawal(
        'withdrawal-id',
        'admin-id',
      );
      expect(result.status).toEqual('WAITING_PERIOD');
    });

    it('should throw a BadRequestException if withdrawal is not pending approval', async () => {
      const withdrawal = { id: 'withdrawal-id', status: 'COMPLETED' };
      mockColdStorageWithdrawalRepo.findOne.mockResolvedValue(withdrawal);
      await expect(service.approveWithdrawal('withdrawal-id', 'admin-id')).rejects.toThrow('Withdrawal cannot be approved. Current status: COMPLETED');
    });
  });

  describe('confirmWithdrawal', () => {
    it('should confirm a withdrawal', async () => {
      const account = { id: 'account-id', currency: 'USD', balance: '1000.00', pendingWithdrawals: '100.00', stellarPublicKey: 'G...' };
      const withdrawal = {
        id: 'withdrawal-id',
        userId: 'user-id',
        amount: '100.00',
        status: 'READY_TO_CONFIRM',
        readyAt: new Date(Date.now() - 1000),
        coldStorageAccount: account,
      };
      mockColdStorageWithdrawalRepo.findOne.mockResolvedValue(withdrawal);
      mockStellarService.sendPayment.mockResolvedValue({} as any);
      mockColdStorageAccountRepo.save.mockResolvedValue({ ...account, balance: '900.00', pendingWithdrawals: '0.00' });
      mockColdStorageWithdrawalRepo.save.mockResolvedValue({ ...withdrawal, status: 'COMPLETED' });

      const result = await service.confirmWithdrawal('user-id', 'withdrawal-id');

      expect(result.status).toEqual('COMPLETED');
      expect(mockStellarService.sendPayment).toHaveBeenCalled();
      expect(mockAuditLogsService.log).toHaveBeenCalled();
    });

    it('should throw a BadRequestException if waiting period has not elapsed', async () => {
      const withdrawal = {
        id: 'withdrawal-id',
        userId: 'user-id',
        status: 'READY_TO_CONFIRM',
        readyAt: new Date(Date.now() + 1000 * 60 * 60),
      };
      mockColdStorageWithdrawalRepo.findOne.mockResolvedValue(withdrawal);
      await expect(service.confirmWithdrawal('user-id', 'withdrawal-id')).rejects.toThrow('Waiting period has not elapsed yet');
    });
  });
});
  });
});
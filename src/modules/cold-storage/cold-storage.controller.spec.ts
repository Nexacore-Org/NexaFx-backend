import { Test, TestingModule } from '@nestjs/testing';
import {
  ColdStorageController,
  ColdStorageAdminController,
} from './cold-storage.controller';
import { ColdStorageService } from './cold-storage.service';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockColdStorageService = {
  setup: jest.fn(),
  deposit: jest.fn(),
  requestWithdrawal: jest.fn(),
  confirmWithdrawal: jest.fn(),
  getUserAccounts: jest.fn(),
  getAllAccounts: jest.fn(),
  getPendingWithdrawals: jest.fn(),
  approveWithdrawal: jest.fn(),
};

describe('ColdStorageController', () => {
  let controller: ColdStorageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ColdStorageController],
      providers: [
        {
          provide: ColdStorageService,
          useValue: mockColdStorageService,
        },
      ],
    }).compile();

    controller = module.get<ColdStorageController>(ColdStorageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('setup', () => {
    it('should call coldStorageService.setup', async () => {
      const req = { user: { id: 'user-id' } };
      const body = { currency: 'USD', stellarPublicKey: 'G...' };
      await controller.setup(req, body);
      expect(mockColdStorageService.setup).toHaveBeenCalledWith(
        'user-id',
        'USD',
        'G...',
      );
    });
  });

  describe('deposit', () => {
    it('should call coldStorageService.deposit', async () => {
      const req = { user: { id: 'user-id' } };
      const body = { currency: 'USD', amount: '1000' };
      await controller.deposit(req, body);
      expect(mockColdStorageService.deposit).toHaveBeenCalledWith(
        'user-id',
        'USD',
        '1000',
      );
    });
  });

  describe('withdraw', () => {
    it('should call coldStorageService.requestWithdrawal', async () => {
      const req = { user: { id: 'user-id' } };
      const body = { amount: '100' };
      await controller.withdraw(req, body);
      expect(mockColdStorageService.requestWithdrawal).toHaveBeenCalledWith(
        'user-id',
        '100',
      );
    });
  });

  describe('confirmWithdraw', () => {
    it('should call coldStorageService.confirmWithdrawal', async () => {
      const req = { user: { id: 'user-id' } };
      const requestId = 'request-id';
      await controller.confirmWithdraw(req, requestId);
      expect(mockColdStorageService.confirmWithdrawal).toHaveBeenCalledWith(
        'user-id',
        'request-id',
      );
    });
  });
});

describe('ColdStorageAdminController', () => {
  let controller: ColdStorageAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ColdStorageAdminController],
      providers: [
        {
          provide: ColdStorageService,
          useValue: mockColdStorageService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ColdStorageAdminController>(
      ColdStorageAdminController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllAccounts', () => {
    it('should call coldStorageService.getAllAccounts', async () => {
      await controller.getAllAccounts();
      expect(mockColdStorageService.getAllAccounts).toHaveBeenCalled();
    });
  });

  describe('getPendingWithdrawals', () => {
    it('should call coldStorageService.getPendingWithdrawals', async () => {
      await controller.getPendingWithdrawals();
      expect(mockColdStorageService.getPendingWithdrawals).toHaveBeenCalled();
    });
  });

  describe('approveWithdrawal', () => {
    it('should call coldStorageService.approveWithdrawal', async () => {
      const req = { user: { id: 'admin-id' } };
      const id = 'withdrawal-id';
      await controller.approveWithdrawal(id, req);
      expect(mockColdStorageService.approveWithdrawal).toHaveBeenCalledWith(
        'withdrawal-id',
        'admin-id',
      );
    });
  });
});

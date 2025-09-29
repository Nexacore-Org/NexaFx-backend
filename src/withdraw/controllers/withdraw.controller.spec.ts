import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawController } from '../controllers/withdraw.controller';
import { WithdrawService } from '../providers/withdraw.service';
import { WithdrawalMethod } from '../enums/withdrawalMethod.enum';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';

describe('WithdrawController', () => {
  let controller: WithdrawController;
  let service: jest.Mocked<WithdrawService>;

  beforeEach(async () => {
    service = {
      createWithdrawal: jest.fn(),
      getWithdrawalHistory: jest.fn(),
      getWithdrawalById: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WithdrawController],
      providers: [{ provide: WithdrawService, useValue: service }],
    }).compile();

    controller = module.get<WithdrawController>(WithdrawController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createWithdrawal', () => {
    it('should call service and return result', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = {
        currency: 'USDC',
        amount: 100,
        destination: 'wallet',
        method: WithdrawalMethod.WALLET,
      };
      const response = {
        id: 'tx-1',
        amount: 100,
        currency: 'USDC',
        status: TransactionStatus.PENDING,
      };
      service.createWithdrawal.mockResolvedValue(response as any);
      const result = await controller.createWithdrawal(req, dto as any);
      expect(service.createWithdrawal).toHaveBeenCalledWith('user-1', dto);
      expect(result).toBe(response);
    });
  });

  describe('getWithdrawalHistory', () => {
    it('should call service and return result', async () => {
      const req = { user: { id: 'user-1' } };
      const response = { withdrawals: [], total: 0, page: 1, limit: 10 };
      service.getWithdrawalHistory.mockResolvedValue(response as any);
      const result = await controller.getWithdrawalHistory(req, 1, 10);
      expect(service.getWithdrawalHistory).toHaveBeenCalledWith(
        'user-1',
        1,
        10,
      );
      expect(result).toBe(response);
    });
  });

  describe('getWithdrawalById', () => {
    it('should call service and return result', async () => {
      const req = { user: { id: 'user-1' } };
      const response = {
        id: 'tx-1',
        amount: 100,
        currency: 'USDC',
        status: TransactionStatus.PENDING,
      };
      service.getWithdrawalById.mockResolvedValue(response as any);
      const result = await controller.getWithdrawalById(req, 'tx-1');
      expect(service.getWithdrawalById).toHaveBeenCalledWith('tx-1', 'user-1');
      expect(result).toBe(response);
    });
  });
});

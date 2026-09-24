import { Test, TestingModule } from '@nestjs/testing';
import { FiatController } from './fiat.controller';
import { FiatService } from './fiat.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';

describe('FiatController', () => {
  let controller: FiatController;
  let service: DeepMockProxy<FiatService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FiatController],
      providers: [
        {
          provide: FiatService,
          useValue: mock<FiatService>(),
        },
      ],
    }).compile();

    controller = module.get<FiatController>(FiatController);
    service = module.get(FiatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('initiateDeposit', () => {
    it('should call the service to initiate a deposit', async () => {
      const req = { user: { userId: 'user-1' } };
      const dto = { amount: 100, currency: 'NGN' };
      await controller.initiateDeposit(req, dto);
      expect(service.initiateDeposit).toHaveBeenCalledWith(
        req.user.userId,
        dto,
      );
    });
  });

  describe('getDeposits', () => {
    it('should call the service to get deposits', async () => {
      const req = { user: { userId: 'user-1' } };
      await controller.getDeposits(req);
      expect(service.getDeposits).toHaveBeenCalledWith(req.user.userId);
    });
  });

  describe('initiateWithdrawal', () => {
    it('should call the service to initiate a withdrawal', async () => {
      const req = { user: { userId: 'user-1' } };
      const dto = {
        amount: 100,
        currency: 'NGN',
        bankCode: '044',
        accountNumber: '1234567890',
      };
      await controller.initiateWithdrawal(req, dto);
      expect(service.initiateWithdrawal).toHaveBeenCalledWith(
        req.user.userId,
        dto,
      );
    });
  });

  describe('getWithdrawals', () => {
    it('should call the service to get withdrawals', async () => {
      const req = { user: { userId: 'user-1' } };
      await controller.getWithdrawals(req);
      expect(service.getWithdrawals).toHaveBeenCalledWith(req.user.userId);
    });
  });

  describe('verifyBankAccount', () => {
    it('should call the service to verify a bank account', async () => {
      const dto = { bankCode: '044', accountNumber: '1234567890' };
      await controller.verifyBankAccount(dto);
      expect(service.verifyBankAccount).toHaveBeenCalledWith(dto);
    });
  });

  describe('handleWebhook', () => {
    it('should call the service to handle a deposit webhook', async () => {
      const req = {
        body: { event: 'payment.completed', data: { tx_ref: 'FIAT_DEP_123' } },
      } as any;
      const signature = 'test-signature';
      await controller.handleWebhook(signature, req);
      expect(service.processDepositWebhook).toHaveBeenCalledWith(
        req.body,
        signature,
      );
    });

    it('should call the service to handle a withdrawal webhook', async () => {
      const req = {
        body: {
          event: 'transfer.completed',
          data: { reference: 'FIAT_WD_123' },
        },
      } as any;
      const signature = 'test-signature';
      await controller.handleWebhook(signature, req);
      expect(service.processWithdrawalWebhook).toHaveBeenCalledWith(
        req.body,
        signature,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WithdrawService } from '../withdraw.service';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../user/entities/user.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { NotificationsService } from '../../notifications/providers/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';
import { WithdrawalMethod } from '../enums/withdrawalMethod.enum';

describe('WithdrawService', () => {
  let service: WithdrawService;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let currencyRepo: jest.Mocked<Repository<Currency>>;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    transactionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
    } as any;
    userRepo = { findOne: jest.fn() } as any;
    currencyRepo = { findOne: jest.fn() } as any;
    notificationsService = { create: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Currency), useValue: currencyRepo },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<WithdrawService>(WithdrawService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWithdrawal', () => {
    const userId = 'user-1';
    const user = { id: userId } as User;
    const currency = { id: 'cur-1', code: 'USDC' } as Currency;
    const dto = {
      currency: 'USDC',
      amount: 100,
      destination: 'wallet-address',
      method: WithdrawalMethod.WALLET,
      description: 'desc',
    };
    const withdrawal = {
      id: 'tx-1',
      ...dto,
      asset: 'USDC',
      status: TransactionStatus.PENDING,
      reference: 'ref',
      currency,
      currencyId: currency.id,
      feeAmount: 0,
      totalAmount: 100,
      destinationAccount: dto.destination,
      initiatorId: userId,
      createdAt: new Date(),
    } as Transaction;

    it('should throw if amount <= 0', async () => {
      await expect(
        service.createWithdrawal(userId, { ...dto, amount: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
    it('should throw if user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.createWithdrawal(userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
    it('should throw if currency not found', async () => {
      userRepo.findOne.mockResolvedValue(user);
      currencyRepo.findOne.mockResolvedValue(null);
      await expect(service.createWithdrawal(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('should throw if insufficient balance', async () => {
      userRepo.findOne.mockResolvedValue(user);
      currencyRepo.findOne.mockResolvedValue(currency);
      jest.spyOn<any, any>(service, 'getUserBalance').mockResolvedValue(50);
      await expect(service.createWithdrawal(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
    it('should create withdrawal and send notifications', async () => {
      userRepo.findOne.mockResolvedValue(user);
      currencyRepo.findOne.mockResolvedValue(currency);
      jest.spyOn<any, any>(service, 'getUserBalance').mockResolvedValue(1000);
      transactionRepo.create.mockReturnValue(withdrawal);
      transactionRepo.save.mockResolvedValue(withdrawal);
      notificationsService.create.mockResolvedValue({} as any);
      const result = await service.createWithdrawal(userId, dto);
      expect(transactionRepo.create).toHaveBeenCalled();
      expect(transactionRepo.save).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: withdrawal.id,
        amount: withdrawal.amount,
        currency: withdrawal.asset,
        status: withdrawal.status,
      });
    });
  });

  describe('getWithdrawalHistory', () => {
    it('should return paginated withdrawal history', async () => {
      const userId = 'user-1';
      const tx = {
        id: 'tx-1',
        asset: 'USDC',
        amount: 100,
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
      } as Transaction;
      transactionRepo.findAndCount.mockResolvedValue([[tx], 1]);
      const result = await service.getWithdrawalHistory(userId, 1, 10);
      expect(result.withdrawals.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getWithdrawalById', () => {
    it('should throw if withdrawal not found', async () => {
      transactionRepo.findOne.mockResolvedValue(null);
      await expect(service.getWithdrawalById('id', 'user')).rejects.toThrow(
        NotFoundException,
      );
    });
    it('should return withdrawal if found', async () => {
      const tx = {
        id: 'tx-1',
        asset: 'USDC',
        amount: 100,
        status: TransactionStatus.PENDING,
        createdAt: new Date(),
      } as Transaction;
      transactionRepo.findOne.mockResolvedValue(tx);
      const result = await service.getWithdrawalById('tx-1', 'user');
      expect(result).toMatchObject({
        id: tx.id,
        amount: tx.amount,
        currency: tx.asset,
        status: tx.status,
      });
    });
  });
});

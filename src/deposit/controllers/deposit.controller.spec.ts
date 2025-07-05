import { Test, TestingModule } from '@nestjs/testing';
import { DepositController } from './deposit.controller';
import { DepositService } from '../providers/deposit.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { DepositMethod } from '../enums/depositMethod.enum';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('DepositController', () => {
  let controller: DepositController;
  let service: jest.Mocked<DepositService>;

  const mockUser = { sub: 'user-123' };

  beforeEach(async () => {
    const mockService = {
      createDeposit: jest.fn(),
      getDepositMethods: jest.fn(),
      generateWalletAddress: jest.fn(),
      getDepositHistory: jest.fn(),
      getDepositById: jest.fn(),
      confirmDeposit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepositController],
      providers: [
        { provide: DepositService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<DepositController>(DepositController);
    service = module.get(DepositService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createDeposit', () => {
    it('should create a deposit successfully', async () => {
      const createDepositDto: CreateDepositDto = {
        currency: 'USDC',
        amount: 100,
        method: DepositMethod.INSTANT,
        description: 'Test deposit',
      };

      const expectedResponse = {
        id: 'deposit-123',
        userId: 'user-123',
        currency: 'USDC',
        amount: 100,
        method: DepositMethod.INSTANT,
        status: TransactionStatus.PENDING,
        reference: 'DEP-20241201-ABC123',
        destinationAddress: '0x1234567890abcdef',
        qrCodeData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        feeAmount: 0,
        totalAmount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.createDeposit.mockResolvedValue(expectedResponse);

      const result = await controller.createDeposit(createDepositDto, { user: mockUser });

      expect(service.createDeposit).toHaveBeenCalledWith('user-123', createDepositDto);
      expect(result).toEqual(expectedResponse);
    });

    it('should handle service errors', async () => {
      const createDepositDto: CreateDepositDto = {
        currency: 'INVALID',
        amount: 100,
      };

      service.createDeposit.mockRejectedValue(new BadRequestException('Invalid currency'));

      await expect(controller.createDeposit(createDepositDto, { user: mockUser }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getDepositMethods', () => {
    it('should return available deposit methods', async () => {
      const expectedResponse = {
        methods: [
          {
            type: DepositMethod.INSTANT,
            name: 'Instant Deposit',
            description: 'Send crypto directly to your NexaFX wallet address.',
            fee: '0%',
            enabled: true,
          },
          {
            type: DepositMethod.MOONPAY,
            name: 'Buy naira via exchange (moonPay etc)',
            description: 'Buy crypto instantly through MoonPay.',
            fee: '0%',
            enabled: true,
          },
          {
            type: DepositMethod.DIRECT_TOPUP,
            name: 'Direct top-up',
            description: 'Top up your wallet directly using your mobile wallet or bank-linked options.',
            fee: '0%',
            enabled: true,
          },
        ],
      };

      service.getDepositMethods.mockResolvedValue(expectedResponse);

      const result = await controller.getDepositMethods();

      expect(service.getDepositMethods).toHaveBeenCalled();
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('generateWalletAddress', () => {
    it('should generate wallet address for valid currency', async () => {
      const currency = 'USDC';
      const expectedResponse = {
        address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        currency: 'USDC',
        network: 'Ethereum',
      };

      service.generateWalletAddress.mockResolvedValue(expectedResponse);

      const result = await controller.generateWalletAddress(currency, { user: mockUser });

      expect(service.generateWalletAddress).toHaveBeenCalledWith('user-123', currency);
      expect(result).toEqual(expectedResponse);
    });

    it('should handle invalid currency', async () => {
      const currency = 'INVALID';

      service.generateWalletAddress.mockRejectedValue(new BadRequestException('Currency INVALID is not supported'));

      await expect(controller.generateWalletAddress(currency, { user: mockUser }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getDepositHistory', () => {
    it('should return deposit history with default pagination', async () => {
      const expectedResponse = {
        deposits: [
          {
            id: 'deposit-123',
            userId: 'user-123',
            currency: 'USDC',
            amount: 100,
            method: DepositMethod.INSTANT,
            status: TransactionStatus.COMPLETED,
            reference: 'DEP-20241201-ABC123',
            feeAmount: 0,
            totalAmount: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      service.getDepositHistory.mockResolvedValue(expectedResponse);

      const result = await controller.getDepositHistory({ user: mockUser });

      expect(service.getDepositHistory).toHaveBeenCalledWith('user-123', {
        page: 1,
        limit: 10,
        status: undefined,
        currency: undefined,
      });
      expect(result).toEqual(expectedResponse);
    });

    it('should return deposit history with custom pagination and filters', async () => {
      const expectedResponse = {
        deposits: [],
        pagination: {
          page: 2,
          limit: 5,
          total: 0,
          totalPages: 0,
        },
      };

      service.getDepositHistory.mockResolvedValue(expectedResponse);

      const result = await controller.getDepositHistory(
        { user: mockUser },
        2,
        5,
        'COMPLETED',
        'USDC'
      );

      expect(service.getDepositHistory).toHaveBeenCalledWith('user-123', {
        page: 2,
        limit: 5,
        status: 'COMPLETED',
        currency: 'USDC',
      });
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getDepositById', () => {
    it('should return deposit by id', async () => {
      const depositId = 'deposit-123';
      const expectedResponse = {
        id: 'deposit-123',
        userId: 'user-123',
        currency: 'USDC',
        amount: 100,
        method: DepositMethod.INSTANT,
        status: TransactionStatus.PENDING,
        reference: 'DEP-20241201-ABC123',
        feeAmount: 0,
        totalAmount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.getDepositById.mockResolvedValue(expectedResponse);

      const result = await controller.getDepositById(depositId, { user: mockUser });

      expect(service.getDepositById).toHaveBeenCalledWith(depositId, 'user-123');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle deposit not found', async () => {
      const depositId = 'non-existent';

      service.getDepositById.mockRejectedValue(new NotFoundException('Deposit not found'));

      await expect(controller.getDepositById(depositId, { user: mockUser }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmDeposit', () => {
    it('should confirm deposit successfully', async () => {
      const depositId = 'deposit-123';
      const expectedResponse = {
        id: 'deposit-123',
        userId: 'user-123',
        currency: 'USDC',
        amount: 100,
        method: DepositMethod.INSTANT,
        status: TransactionStatus.COMPLETED,
        reference: 'DEP-20241201-ABC123',
        feeAmount: 0,
        totalAmount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.confirmDeposit.mockResolvedValue(expectedResponse);

      const result = await controller.confirmDeposit(depositId, { user: mockUser });

      expect(service.confirmDeposit).toHaveBeenCalledWith(depositId, 'user-123');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle deposit not found for confirmation', async () => {
      const depositId = 'non-existent';

      service.confirmDeposit.mockRejectedValue(new NotFoundException('Pending deposit not found'));

      await expect(controller.confirmDeposit(depositId, { user: mockUser }))
        .rejects.toThrow(NotFoundException);
    });
  });
});

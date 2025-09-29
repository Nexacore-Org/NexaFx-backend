import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositService } from './deposit.service';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../user/entities/user.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { NotificationsService } from '../../notifications/providers/notifications.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { DepositMethod } from '../enums/depositMethod.enum';
import { TransactionType } from '../../transactions/enums/transaction-type.enum';
import { TransactionStatus } from '../../transactions/enums/transaction-status.enum';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('DepositService', () => {
  let service: DepositService;
  let transactionRepository: jest.Mocked<Repository<Transaction>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let currencyRepository: jest.Mocked<Repository<Currency>>;
  let notificationsService: jest.Mocked<NotificationsService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockCurrency = {
    id: 'currency-123',
    code: 'USDC',
    name: 'USD Coin',
    type: 'CRYPTO',
    isActive: true,
  };

  const mockTransaction = {
    id: 'transaction-123',
    initiatorId: 'user-123',
    asset: 'USDC',
    type: TransactionType.DEPOSIT,
    amount: 100,
    currencyId: 'currency-123',
    status: TransactionStatus.PENDING,
    reference: 'DEP-20241201-ABC123',
    description: 'INSTANT deposit',
    totalAmount: 100,
    feeAmount: 0,
    metadata: {
      method: DepositMethod.INSTANT,
      qrCodeData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      depositType: 'USER_INITIATED',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const mockTransactionRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
    };

    const mockCurrencyRepository = {
      findOne: jest.fn(),
    };

    const mockNotificationsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepositService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Currency),
          useValue: mockCurrencyRepository,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<DepositService>(DepositService);
    transactionRepository = module.get(getRepositoryToken(Transaction));
    userRepository = module.get(getRepositoryToken(User));
    currencyRepository = module.get(getRepositoryToken(Currency));
    notificationsService = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDeposit', () => {
    const createDepositDto: CreateDepositDto = {
      currency: 'USDC',
      amount: 100,
      method: DepositMethod.INSTANT,
      description: 'Test deposit',
    };

    it('should create a deposit successfully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
      currencyRepository.findOne.mockResolvedValue(mockCurrency as any);
      transactionRepository.create.mockReturnValue(mockTransaction as any);
      transactionRepository.save.mockResolvedValue(mockTransaction as any);
      notificationsService.create.mockResolvedValue(undefined);

      const result = await service.createDeposit('user-123', createDepositDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
      expect(currencyRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'USDC' },
      });
      expect(transactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          initiatorId: 'user-123',
          asset: 'USDC',
          type: TransactionType.DEPOSIT,
          amount: 100,
          currencyId: 'currency-123',
          status: TransactionStatus.PENDING,
        }),
      );
      expect(transactionRepository.save).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'transaction-123');
      expect(result).toHaveProperty('currency', 'USDC');
      expect(result).toHaveProperty('amount', 100);
    });

    it('should throw BadRequestException for invalid amount', async () => {
      const invalidDto = { ...createDepositDto, amount: 0 };

      await expect(
        service.createDeposit('user-123', invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createDeposit('non-existent', createDepositDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for unsupported currency', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
      currencyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createDeposit('user-123', createDepositDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle notification service errors gracefully', async () => {
      userRepository.findOne.mockResolvedValue(mockUser as any);
      currencyRepository.findOne.mockResolvedValue(mockCurrency as any);
      transactionRepository.create.mockReturnValue(mockTransaction as any);
      transactionRepository.save.mockResolvedValue(mockTransaction as any);
      notificationsService.create.mockRejectedValue(
        new Error('Notification service error'),
      );

      const result = await service.createDeposit('user-123', createDepositDto);

      expect(result).toBeDefined();
      expect(notificationsService.create).toHaveBeenCalled();
    });
  });

  describe('getDepositMethods', () => {
    it('should return available deposit methods', async () => {
      const result = await service.getDepositMethods();

      expect(result).toEqual({
        methods: [
          {
            type: DepositMethod.INSTANT,
            name: 'Instant Deposit',
            description:
              'Send crypto directly to your NexaFX wallet address. Just copy your address and make the transfer.',
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
            description:
              'Top up your wallet directly using your mobile wallet or bank-linked options like Google pay etc',
            fee: '0%',
            enabled: true,
          },
        ],
      });
    });
  });

  describe('generateWalletAddress', () => {
    it('should generate wallet address for valid currency', async () => {
      currencyRepository.findOne.mockResolvedValue(mockCurrency as any);

      const result = await service.generateWalletAddress('user-123', 'USDC');

      expect(currencyRepository.findOne).toHaveBeenCalledWith({
        where: { code: 'USDC' },
      });
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('currency', 'USDC');
      expect(result).toHaveProperty('network', 'Ethereum');
    });

    it('should throw BadRequestException for unsupported currency', async () => {
      currencyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.generateWalletAddress('user-123', 'INVALID'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDepositHistory', () => {
    it('should return deposit history with pagination', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTransaction], 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getDepositHistory('user-123', {
        page: 1,
        limit: 10,
      });

      expect(transactionRepository.createQueryBuilder).toHaveBeenCalledWith(
        'transaction',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'transaction.initiatorId = :userId',
        { userId: 'user-123' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.type = :type',
        { type: TransactionType.DEPOSIT },
      );
      expect(result).toHaveProperty('deposits');
      expect(result).toHaveProperty('pagination');
    });

    it('should apply status filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTransaction], 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.getDepositHistory('user-123', {
        page: 1,
        limit: 10,
        status: 'COMPLETED',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.status = :status',
        { status: 'COMPLETED' },
      );
    });

    it('should apply currency filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTransaction], 1]),
      };

      transactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.getDepositHistory('user-123', {
        page: 1,
        limit: 10,
        currency: 'USDC',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.asset = :currency',
        { currency: 'USDC' },
      );
    });
  });

  describe('getDepositById', () => {
    it('should return deposit by id', async () => {
      transactionRepository.findOne.mockResolvedValue(mockTransaction as any);

      const result = await service.getDepositById(
        'transaction-123',
        'user-123',
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'transaction-123',
          initiatorId: 'user-123',
          type: TransactionType.DEPOSIT,
        },
        relations: ['currency'],
      });
      expect(result).toHaveProperty('id', 'transaction-123');
    });

    it('should throw NotFoundException for non-existent deposit', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDepositById('non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmDeposit', () => {
    it('should confirm deposit successfully', async () => {
      const pendingTransaction = {
        ...mockTransaction,
        status: TransactionStatus.PENDING,
        save: jest.fn().mockResolvedValue({
          ...mockTransaction,
          status: TransactionStatus.COMPLETED,
          completionDate: new Date(),
          processingDate: new Date(),
        }),
      };

      transactionRepository.findOne.mockResolvedValue(
        pendingTransaction as any,
      );
      notificationsService.create.mockResolvedValue(undefined);

      const result = await service.confirmDeposit(
        'transaction-123',
        'user-123',
      );

      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'transaction-123',
          initiatorId: 'user-123',
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
        },
        relations: ['currency'],
      });
      expect(pendingTransaction.save).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalled();
      expect(result).toHaveProperty('status', TransactionStatus.COMPLETED);
    });

    it('should throw NotFoundException for non-existent pending deposit', async () => {
      transactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.confirmDeposit('non-existent', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle notification service errors gracefully during confirmation', async () => {
      const pendingTransaction = {
        ...mockTransaction,
        status: TransactionStatus.PENDING,
        save: jest.fn().mockResolvedValue({
          ...mockTransaction,
          status: TransactionStatus.COMPLETED,
          completionDate: new Date(),
          processingDate: new Date(),
        }),
      };

      transactionRepository.findOne.mockResolvedValue(
        pendingTransaction as any,
      );
      notificationsService.create.mockRejectedValue(
        new Error('Notification service error'),
      );

      const result = await service.confirmDeposit(
        'transaction-123',
        'user-123',
      );

      expect(result).toBeDefined();
      expect(notificationsService.create).toHaveBeenCalled();
    });
  });

  describe('private methods', () => {
    describe('generateDepositReference', () => {
      it('should generate unique deposit reference', () => {
        const reference1 = (service as any).generateDepositReference();
        const reference2 = (service as any).generateDepositReference();

        expect(reference1).toMatch(/^DEP-\d{8}-[A-Z0-9]{6}$/);
        expect(reference2).toMatch(/^DEP-\d{8}-[A-Z0-9]{6}$/);
        expect(reference1).not.toBe(reference2);
      });
    });

    describe('generateCryptoAddress', () => {
      it('should generate address for supported currencies', async () => {
        const usdcAddress = await (service as any).generateCryptoAddress(
          'USDC',
        );
        const btcAddress = await (service as any).generateCryptoAddress('BTC');
        const ethAddress = await (service as any).generateCryptoAddress('ETH');

        expect(usdcAddress).toBe('0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32');
        expect(btcAddress).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
        expect(ethAddress).toBe('0x742d35Cc6634C0532925a3b8D4C9db96590c6C87');
      });

      it('should generate fallback address for unsupported currencies', async () => {
        const address = await (service as any).generateCryptoAddress('UNKNOWN');

        expect(address).toMatch(/^UNKNOWN-[a-f0-9-]+$/);
      });
    });

    describe('generateQRCode', () => {
      it('should generate QR code data URL', async () => {
        const qrCode = await (service as any).generateQRCode('test-address');

        expect(qrCode).toMatch(/^data:image\/png;base64,/);
      });

      it('should throw InternalServerErrorException on QR generation failure', async () => {
        // Mock QRCode.toDataURL to throw an error
        jest.doMock('qrcode', () => ({
          toDataURL: jest
            .fn()
            .mockRejectedValue(new Error('QR generation failed')),
        }));

        await expect(
          (service as any).generateQRCode('test-address'),
        ).rejects.toThrow(InternalServerErrorException);
      });
    });

    describe('getNetworkForCurrency', () => {
      it('should return correct network for supported currencies', () => {
        expect((service as any).getNetworkForCurrency('USDC')).toBe('Ethereum');
        expect((service as any).getNetworkForCurrency('BTC')).toBe('Bitcoin');
        expect((service as any).getNetworkForCurrency('ETH')).toBe('Ethereum');
        expect((service as any).getNetworkForCurrency('NGN')).toBe('Fiat');
      });

      it('should return Unknown for unsupported currencies', () => {
        expect((service as any).getNetworkForCurrency('UNKNOWN')).toBe(
          'Unknown',
        );
      });
    });

    describe('mapToDepositResponse', () => {
      it('should map transaction to deposit response', () => {
        const result = (service as any).mapToDepositResponse(
          mockTransaction,
          'destination-address',
          'qr-code-data',
        );

        expect(result).toEqual({
          id: 'transaction-123',
          userId: 'user-123',
          currency: 'USDC',
          amount: 100,
          method: DepositMethod.INSTANT,
          status: TransactionStatus.PENDING,
          reference: 'DEP-20241201-ABC123',
          destinationAddress: 'destination-address',
          qrCodeData: 'qr-code-data',
          feeAmount: 0,
          totalAmount: 100,
          metadata: mockTransaction.metadata,
          createdAt: mockTransaction.createdAt,
          updatedAt: mockTransaction.updatedAt,
        });
      });
    });
  });
});

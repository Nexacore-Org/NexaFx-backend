import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { ConversionsService } from './conversions.service';
import { ConversionQuote, ConversionQuoteStatus } from './entities/conversion-quote.entity';
import { Transaction, TransactionStatus, TransactionType } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { ConversionsGateway } from './conversions.gateway';

describe('ConversionsService', () => {
  let service: ConversionsService;

  const mockQuote: {
    id: string;
    userId: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    toAmount: string;
    rate: string;
    fee: string;
    feePercent: string;
    expiresAt: Date;
    usedAt: Date | null;
    status: ConversionQuoteStatus;
    createdAt: Date;
    updatedAt: Date;
  } = {
    id: 'quote-123',
    userId: 'user-123',
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    fromAmount: '100.00000000',
    toAmount: '89.55000000',
    rate: '0.90000000',
    fee: '0.50000000',
    feePercent: '0.5000',
    expiresAt: new Date(Date.now() + 30000),
    usedAt: null,
    status: ConversionQuoteStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-123',
    walletPublicKey: 'G123',
    walletSecretKeyEncrypted: 'S123',
    balances: { USD: 200, EUR: 50 },
  };

  const mockQuoteRepository = {
    create: jest.fn((dto) => ({ ...dto, id: 'quote-123', createdAt: new Date(), updatedAt: new Date() })),
    save: jest.fn(async (quote) => ({ ...quote, id: quote.id || 'quote-123' })),
    findOne: jest.fn(async () => ({ ...mockQuote })),
    findAndCount: jest.fn(async () => [[mockQuote], 1]),
  };

  const mockTransactionRepository = {
    create: jest.fn((dto) => ({ ...dto, id: 'tx-123' })),
    save: jest.fn(async (tx) => ({ ...tx, id: 'tx-123' })),
    find: jest.fn(async () => [{ id: 'tx-123', userId: 'user-123', metadata: { quoteId: 'quote-123' }, currency: 'USD', toCurrency: 'EUR', amount: '100.00000000' }]),
    findOne: jest.fn(async () => null),
  };

  const mockUserRepository = {
    findOne: jest.fn(async () => ({ ...mockUser })),
    save: jest.fn(async (user) => user),
  };

  const mockWalletRepository = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((dto) => ({ ...dto, id: 'wallet-123' })),
    save: jest.fn(async (w) => w),
  };

  const mockExchangeRatesService = {
    getRate: jest.fn(async () => ({ rate: 0.9 })),
  };

  const mockLedgerService = {
    record: jest.fn(async () => []),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'CONVERSION_FEE_PERCENT') return '0.5';
      return null;
    }),
  };

  const mockConversionsGateway = {
    emitTransactionUpdated: jest.fn(),
  };

  const mockQueryRunner = {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    manager: {
      findOne: jest.fn(async (entity, opts) => {
        if (entity === ConversionQuote) return { ...mockQuote };
        if (entity === User) return { ...mockUser, balances: { USD: 200, EUR: 50 } };
        if (entity === Wallet) return null;
        return null;
      }),
      find: jest.fn(async () => []),
      create: jest.fn((entity, payload) => ({ ...payload, id: 'generated-id' })),
      save: jest.fn(async (entity, payload) => payload || entity),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
    getRepository: jest.fn(() => ({
      find: jest.fn(async () => []),
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionsService,
        { provide: getRepositoryToken(ConversionQuote), useValue: mockQuoteRepository },
        { provide: getRepositoryToken(Transaction), useValue: mockTransactionRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Wallet), useValue: mockWalletRepository },
        { provide: ExchangeRatesService, useValue: mockExchangeRatesService },
        { provide: LedgerService, useValue: mockLedgerService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConversionsGateway, useValue: mockConversionsGateway },
      ],
    }).compile();

    service = module.get<ConversionsService>(ConversionsService);
  });

  describe('Quote Engine', () => {
    it('should create a valid conversion quote with 30-second expiry and fee deduction', async () => {
      const result = await service.createQuote('user-123', {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        fromAmount: '100',
      });

      expect(result).toBeDefined();
      expect(result.quoteId).toBeDefined();
      expect(result.fromAmount).toBe('100.00000000');
      // 0.5% fee on 100 = 0.5; net = 99.5; at 0.9 rate = 89.55
      expect(result.fee).toBe('0.50000000');
      expect(result.toAmount).toBe('89.55000000');
      expect(result.rate).toBe('0.90000000');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw BadRequestException for same currency conversion', async () => {
      await expect(
        service.createQuote('user-123', {
          fromCurrency: 'USD',
          toCurrency: 'USD',
          fromAmount: '100',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for zero or negative amount', async () => {
      await expect(
        service.createQuote('user-123', {
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          fromAmount: '0',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Execute Conversion', () => {
    it('should successfully execute conversion atomically and emit WebSocket event', async () => {
      const result = await service.executeConversion('user-123', {
        quoteId: 'quote-123',
      });

      expect(result.transaction).toBeDefined();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockLedgerService.record).toHaveBeenCalled();
      expect(mockConversionsGateway.emitTransactionUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: expect.any(String),
          userId: 'user-123',
        }),
      );
    });

    it('should throw HTTP 422 if quote does not exist', async () => {
      mockQuoteRepository.findOne.mockResolvedValueOnce(null as any);

      await expect(
        service.executeConversion('user-123', { quoteId: 'non-existent' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw HTTP 422 if quote has expired', async () => {
      mockQuoteRepository.findOne.mockResolvedValueOnce({
        ...mockQuote,
        expiresAt: new Date(Date.now() - 5000),
      });

      await expect(
        service.executeConversion('user-123', { quoteId: 'quote-123' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw HTTP 422 if quote is already used', async () => {
      mockQuoteRepository.findOne.mockResolvedValueOnce({
        ...mockQuote,
        status: ConversionQuoteStatus.USED,
        usedAt: new Date(),
      });

      await expect(
        service.executeConversion('user-123', { quoteId: 'quote-123' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw HTTP 422 if rate movement exceeds 1% slippage threshold', async () => {
      // Current rate moves from 0.90 to 0.95 (> 1% diff)
      mockExchangeRatesService.getRate.mockResolvedValueOnce({ rate: 0.95 });

      await expect(
        service.executeConversion('user-123', { quoteId: 'quote-123' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw HTTP 422 on insufficient balance and rollback', async () => {
      mockQueryRunner.manager.findOne.mockImplementation(async (entity) => {
        if (entity === ConversionQuote) return { ...mockQuote };
        if (entity === User) return { ...mockUser, balances: { USD: 10, EUR: 50 } };
        return null;
      });

      await expect(
        service.executeConversion('user-123', { quoteId: 'quote-123' }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('Conversion History & Details', () => {
    it('should return paginated conversions for user', async () => {
      const result = await service.getConversions('user-123', 1, 10);
      expect(result.data).toBeDefined();
      expect(result.meta.total).toBe(1);
    });

    it('should return detailed conversion by ID', async () => {
      const result = await service.getConversionById('user-123', 'quote-123');
      expect(result.quote).toBeDefined();
      expect(result.currencies).toEqual({ from: 'USD', to: 'EUR' });
    });

    it('should throw NotFoundException if conversion ID not found', async () => {
      mockQuoteRepository.findOne.mockResolvedValueOnce(null as any);
      await expect(service.getConversionById('user-123', 'invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

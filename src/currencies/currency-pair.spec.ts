jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const noop = () => () => {};
  const getRepositoryToken = (entity: any) =>
    `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: any) => Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    Entity: noop,
    PrimaryGeneratedColumn: noop,
    Column: noop,
    CreateDateColumn: noop,
    UpdateDateColumn: noop,
    ManyToOne: noop,
    OneToMany: noop,
    JoinColumn: noop,
    Index: noop,
  };
});

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiProperty: noop,
    ApiPropertyOptional: noop,
    ApiTags: noop,
  };
});

jest.mock('../exchange-rates/exchange-rates.service', () => ({
  ExchangeRatesService: class ExchangeRatesService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyPairController } from './controllers/currency-pair.controller';
import { CurrencyPairService } from './services/currency-pair.service';
import { CurrencyPair } from './entities/currency-pair.entity';
import {
  CreateCurrencyPairDto,
  UpdateCurrencyPairDto,
  SuspendPairDto,
} from './dto/currency-pair.dto';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('CurrencyPairController & CurrencyPairService (#1460)', () => {
  let controller: CurrencyPairController;
  let service: CurrencyPairService;
  let mockRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const validPairId = '11111111-1111-4111-8111-111111111111';

  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto) => ({ id: validPairId, ...dto })),
      save: jest.fn(async (entity) => entity),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurrencyPairController],
      providers: [
        CurrencyPairService,
        {
          provide: getRepositoryToken(CurrencyPair),
          useValue: mockRepo,
        },
        {
          provide: ExchangeRatesService,
          useValue: {
            getRate: jest.fn().mockResolvedValue({ rate: 1600 }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CurrencyPairController>(CurrencyPairController);
    service = module.get<CurrencyPairService>(CurrencyPairService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  describe('createPair & CreateCurrencyPairDto', () => {
    it('uppercases currency codes and creates a valid pair', async () => {
      const dto = await validationPipe.transform(
        {
          fromCurrencyCode: 'xlm',
          toCurrencyCode: 'ngn',
          spreadPercent: 0.5,
          minAmountUsd: 10,
          maxAmountUsd: 5000,
        },
        { type: 'body', metatype: CreateCurrencyPairDto },
      );

      const created = await controller.createPair(dto);
      expect(created).toEqual(
        expect.objectContaining({
          fromCurrencyCode: 'XLM',
          toCurrencyCode: 'NGN',
          spreadPercent: 0.5,
          minAmountUsd: 10,
          maxAmountUsd: 5000,
        }),
      );
    });

    it('rejects spreadPercent < 0 or > 100 with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          {
            fromCurrencyCode: 'XLM',
            toCurrencyCode: 'NGN',
            spreadPercent: -1,
          },
          { type: 'body', metatype: CreateCurrencyPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        validationPipe.transform(
          {
            fromCurrencyCode: 'XLM',
            toCurrencyCode: 'NGN',
            spreadPercent: 105,
          },
          { type: 'body', metatype: CreateCurrencyPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          fromCurrencyCode: 'XLM',
          toCurrencyCode: 'NGN',
          spreadPercent: -5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects minAmountUsd > maxAmountUsd with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          {
            fromCurrencyCode: 'XLM',
            toCurrencyCode: 'NGN',
            minAmountUsd: 500,
            maxAmountUsd: 100,
          },
          { type: 'body', metatype: CreateCurrencyPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          fromCurrencyCode: 'XLM',
          toCurrencyCode: 'NGN',
          minAmountUsd: 500,
          maxAmountUsd: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown fields or immutable entity fields (id, createdAt) with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          {
            fromCurrencyCode: 'XLM',
            toCurrencyCode: 'NGN',
            id: 'hacked-id',
          },
          { type: 'body', metatype: CreateCurrencyPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          fromCurrencyCode: 'XLM',
          toCurrencyCode: 'NGN',
          id: 'hacked-id',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePair & UpdateCurrencyPairDto', () => {
    it('uppercases currency codes on update and enforces minAmountUsd <= maxAmountUsd against existing bounds', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: validPairId,
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
        spreadPercent: 0.5,
        minAmountUsd: 50,
        maxAmountUsd: 1000,
        isActive: true,
      });

      const updated = await controller.updatePair(validPairId, {
        fromCurrencyCode: 'usdc',
        toCurrencyCode: 'usd',
        spreadPercent: 1.25,
      });

      expect(updated.fromCurrencyCode).toBe('USDC');
      expect(updated.toCurrencyCode).toBe('USD');
      expect(updated.spreadPercent).toBe(1.25);

      await expect(
        controller.updatePair(validPairId, { minAmountUsd: 2000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects id/createdAt or unknown fields on update with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          { spreadPercent: 1, createdAt: '2020-01-01', unknownField: true },
          { type: 'body', metatype: UpdateCurrencyPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.update(validPairId, {
          spreadPercent: 1,
          id: 'new-id',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-UUID :id on updatePair, suspendPair, and resumePair with 400 BadRequestException', async () => {
      const uuidPipe = new ParseUUIDPipe();
      await expect(
        uuidPipe.transform('not-a-uuid', { type: 'param', data: 'id' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.updatePair('not-a-uuid', { spreadPercent: 1 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.suspendPair('not-a-uuid', {
          reason: 'Volatility',
          duration: 'PT1H',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(controller.resumePair('not-a-uuid')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when pair does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        controller.updatePair(validPairId, { spreadPercent: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendPair & SuspendPairDto', () => {
    it('suspends a pair with valid reason and ISO duration', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: validPairId,
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
        isActive: true,
      });

      const dto = await validationPipe.transform(
        { reason: 'Market maintenance', duration: 'PT2H' },
        { type: 'body', metatype: SuspendPairDto },
      );

      const suspended = await controller.suspendPair(validPairId, dto);
      expect(suspended.isActive).toBe(false);
      expect(suspended.suspensionReason).toBe('Market maintenance');
      expect(suspended.suspendedUntil).toBeInstanceOf(Date);
    });

    it('rejects empty reason, invalid duration, or unknown fields on suspend', async () => {
      await expect(
        validationPipe.transform(
          { reason: '', duration: 'PT1H', extra: 'bad' },
          { type: 'body', metatype: SuspendPairDto },
        ),
      ).rejects.toThrow(BadRequestException);

      mockRepo.findOne.mockResolvedValue({
        id: validPairId,
        fromCurrencyCode: 'XLM',
        toCurrencyCode: 'NGN',
        isActive: true,
      });
      await expect(
        service.suspend(validPairId, 'Reason', 'invalid-duration'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

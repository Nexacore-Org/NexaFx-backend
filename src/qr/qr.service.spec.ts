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
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {
    get(key: string) {
      if (key === 'QR_HMAC_SECRET') return 'unit-test-qr-hmac-secret';
      return undefined;
    }
  },
}));

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

jest.mock('@nestjs/graphql', () => {
  const noop = () => () => {};
  return {
    GqlExecutionContext: { create: jest.fn() },
    ObjectType: noop,
    Field: noop,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { QrService } from './qr.service';
import { QrController } from './qr.controller';
import { GenerateDynamicQrDto } from './dto/qr.dto';
import { User } from '../users/user.entity';

describe('QrService & QrController (#1480)', () => {
  let service: QrService;
  let controller: QrController;
  let mockUserRepo: { findOne: jest.Mock };

  const validMerchantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    mockUserRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        if (where?.id === validMerchantId) {
          return {
            id: validMerchantId,
            isDeleted: false,
            isSuspended: false,
          };
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrController],
      providers: [
        QrService,
        ConfigService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<QrService>(QrService);
    controller = module.get<QrController>(QrController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  describe('generateStaticQr', () => {
    it('generates a signed static QR code for an existing merchant', async () => {
      const qrCode = await service.generateStaticQr(validMerchantId);
      expect(qrCode).toContain('data:image/png;base64,');

      const signedJson = service.getLastSignedPayload()!;
      const parsed = JSON.parse(signedJson);
      expect(parsed.type).toBe('STATIC');
      expect(parsed.merchantId).toBe(validMerchantId);
      expect(typeof parsed.issuedAt).toBe('number');
      expect(typeof parsed.expiresAt).toBe('number');
      expect(typeof parsed.signature).toBe('string');
      expect(parsed.signature.length).toBe(64);
    });

    it('throws 400 if merchant ID is empty or does not exist', async () => {
      await expect(service.generateStaticQr('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.generateStaticQr('22222222-2222-4222-8222-222222222222'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.generateStaticQr('not-a-uuid-merchant'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateDynamicQr & DTO validation', () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    it('generates a signed dynamic QR code for valid data', async () => {
      const data = {
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
      };
      const qrCode = await service.generateDynamicQr(data);
      expect(qrCode).toContain('data:image/png;base64,');

      const signed = JSON.parse(service.getLastSignedPayload()!);
      expect(signed).toEqual(
        expect.objectContaining({
          type: 'DYNAMIC',
          merchantId: validMerchantId,
          amount: 100,
          currency: 'USD',
          reference: 'test-ref',
        }),
      );
      expect(signed.signature).toHaveLength(64);
    });

    it('rejects negative or zero amounts with 400 BadRequestException at generation', async () => {
      await expect(
        validationPipe.transform(
          {
            merchantId: validMerchantId,
            amount: -50,
            reference: 'neg-ref',
            currency: 'USD',
          },
          { type: 'body', metatype: GenerateDynamicQrDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateDynamicQr({
          merchantId: validMerchantId,
          amount: -50,
          reference: 'neg-ref',
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateDynamicQr({
          merchantId: validMerchantId,
          amount: 0,
          reference: 'zero-ref',
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported currencies with 400 BadRequestException', async () => {
      await expect(
        validationPipe.transform(
          {
            merchantId: validMerchantId,
            amount: 50,
            reference: 'bad-curr',
            currency: 'DOGE',
          },
          { type: 'body', metatype: GenerateDynamicQrDto },
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateDynamicQr({
          merchantId: validMerchantId,
          amount: 50,
          reference: 'bad-curr',
          currency: 'DOGE',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('surfaces 503 ServiceUnavailableException instead of mock_qr_for_ when QRCode.toDataURL fails', async () => {
      jest
        .spyOn(QRCode, 'toDataURL')
        .mockRejectedValueOnce(new Error('Canvas failure') as never);

      await expect(
        service.generateDynamicQr({
          merchantId: validMerchantId,
          amount: 25,
          reference: 'ref-err',
          currency: 'USD',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('processScan — HMAC verification, tampering, and expiry', () => {
    it('processes a valid signed static QR payload', async () => {
      await service.generateStaticQr(validMerchantId);
      const signedPayload = service.getLastSignedPayload()!;

      const session = await service.processScan(signedPayload);
      expect(session).toEqual({
        status: 'pending',
        merchantId: validMerchantId,
        requiresAmount: true,
      });
    });

    it('processes a valid signed dynamic QR payload (both JSON string and generated data URL)', async () => {
      const qrDataUrl = await service.generateDynamicQr({
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
      });
      const signedPayload = service.getLastSignedPayload()!;

      const fromJson = await service.processScan(signedPayload);
      expect(fromJson).toEqual({
        status: 'ready',
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
        requiresAmount: false,
      });

      const fromDataUrl = await service.processScan(qrDataUrl);
      expect(fromDataUrl).toEqual(fromJson);
    });

    it('rejects a payload whose amount was modified after signing with 400 BadRequestException', async () => {
      await service.generateDynamicQr({
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
      });
      const signed = JSON.parse(service.getLastSignedPayload()!);
      signed.amount = 1; // attacker tampers with amount

      await expect(service.processScan(JSON.stringify(signed))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a payload whose merchantId was modified after signing with 400 BadRequestException', async () => {
      await service.generateDynamicQr({
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
      });
      const signed = JSON.parse(service.getLastSignedPayload()!);
      signed.merchantId = '99999999-9999-4999-8999-999999999999';

      await expect(service.processScan(JSON.stringify(signed))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an unsigned payload with 400 BadRequestException', async () => {
      const unsigned = JSON.stringify({
        type: 'DYNAMIC',
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'forged-ref',
      });

      await expect(service.processScan(unsigned)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired signed payload with 400 BadRequestException', async () => {
      const now = Date.now();
      const expiredPayload = service.createSignedPayload({
        type: 'DYNAMIC',
        merchantId: validMerchantId,
        amount: 100,
        currency: 'USD',
        reference: 'expired-ref',
        issuedAt: now - 20_000,
        expiresAt: now - 1_000,
      });

      await expect(service.processScan(expiredPayload)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

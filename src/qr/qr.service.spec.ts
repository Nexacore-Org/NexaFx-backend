import { Test, TestingModule } from '@nestjs/testing';
import { QrService } from './qr.service';
import { BadRequestException } from '@nestjs/common';

describe('QrService', () => {
  let service: QrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QrService],
    }).compile();

    service = module.get<QrService>(QrService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateStaticQr', () => {
    it('should generate a QR code for a valid merchant ID', async () => {
      const merchantId = 'test-merchant';
      const qrCode = await service.generateStaticQr(merchantId);
      expect(qrCode).toContain('data:image/png;base64,');
    });

    it('should throw an error if merchant ID is not provided', async () => {
      await expect(service.generateStaticQr('')).rejects.toThrow(
        new BadRequestException('Merchant ID is required'),
      );
    });
  });

  describe('generateDynamicQr', () => {
    it('should generate a QR code for valid dynamic data', async () => {
      const data = {
        merchantId: 'test-merchant',
        amount: 100,
        reference: 'test-ref',
      };
      const qrCode = await service.generateDynamicQr(data);
      expect(qrCode).toContain('data:image/png;base64,');
    });

    it('should throw an error if required fields are missing', async () => {
      const data = { merchantId: 'test-merchant', amount: 100, reference: '' };
      await expect(service.generateDynamicQr(data)).rejects.toThrow(
        new BadRequestException(
          'Merchant ID, Amount, and Reference are required for dynamic QR',
        ),
      );
    });
  });

  describe('processScan', () => {
    it('should process a static QR code payload', async () => {
      const payload = JSON.stringify({
        type: 'STATIC',
        merchantId: 'test-merchant',
      });
      const session = await service.processScan(payload);
      expect(session).toEqual({
        status: 'pending',
        merchantId: 'test-merchant',
        requiresAmount: true,
      });
    });

    it('should process a dynamic QR code payload', async () => {
      const payload = JSON.stringify({
        type: 'DYNAMIC',
        merchantId: 'test-merchant',
        amount: 100,
        reference: 'test-ref',
      });
      const session = await service.processScan(payload);
      expect(session).toEqual({
        status: 'ready',
        merchantId: 'test-merchant',
        amount: 100,
        currency: 'USD',
        reference: 'test-ref',
        requiresAmount: false,
      });
    });

    it('should throw an error for invalid QR code data', async () => {
      await expect(service.processScan('invalid-json')).rejects.toThrow(
        new BadRequestException('Invalid QR code data format'),
      );
    });

    it('should throw an error for invalid QR type', async () => {
      const payload = JSON.stringify({
        type: 'INVALID',
        merchantId: 'test-merchant',
      });
      await expect(service.processScan(payload)).rejects.toThrow(
        new BadRequestException('Invalid QR code data format'),
      );
    });
  });
});

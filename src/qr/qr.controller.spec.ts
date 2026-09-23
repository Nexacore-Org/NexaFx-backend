import { Test, TestingModule } from '@nestjs/testing';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

describe('QrController', () => {
  let controller: QrController;
  let service: QrService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QrController],
      providers: [
        {
          provide: QrService,
          useValue: {
            generateStaticQr: jest.fn(),
            generateDynamicQr: jest.fn(),
            processScan: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<QrController>(QrController);
    service = module.get<QrService>(QrService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStaticQr', () => {
    it('should call qrService.generateStaticQr with the correct merchantId', async () => {
      const merchantId = 'test-merchant';
      await controller.getStaticQr(merchantId);
      expect(service.generateStaticQr).toHaveBeenCalledWith(merchantId);
    });
  });

  describe('getDynamicQr', () => {
    it('should call qrService.generateDynamicQr with the correct body', async () => {
      const body = {
        merchantId: 'test-merchant',
        amount: 100,
        reference: 'test-ref',
      };
      await controller.getDynamicQr(body);
      expect(service.generateDynamicQr).toHaveBeenCalledWith(body);
    });
  });

  describe('scanQr', () => {
    it('should call qrService.processScan with the correct payload', async () => {
      const body = { payload: 'test-payload' };
      await controller.scanQr(body);
      expect(service.processScan).toHaveBeenCalledWith(body.payload);
    });
  });
});

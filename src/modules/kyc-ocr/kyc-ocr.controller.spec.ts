import { Test, TestingModule } from '@nestjs/testing';
import { KycOcrController } from './kyc-ocr.controller';
import { KycOcrService } from './kyc-ocr.service';

describe('KycOcrController', () => {
  let controller: KycOcrController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      extractForApplication: jest.fn().mockResolvedValue({ confidence: 90 }),
      getResult: jest.fn().mockReturnValue({ confidence: 90 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycOcrController],
      providers: [{ provide: KycOcrService, useValue: service }],
    }).compile();

    controller = module.get(KycOcrController);
  });

  it('extract forwards dto fields to service', async () => {
    await controller.extract({
      kycApplicationId: 'k1',
      imageKey: 's3://doc.png',
      submittedDocumentNumber: 'AB123456',
    });
    expect(service.extractForApplication).toHaveBeenCalledWith(
      'k1',
      's3://doc.png',
      'AB123456',
    );
  });

  it('getResult forwards application id', () => {
    controller.getResult('k2');
    expect(service.getResult).toHaveBeenCalledWith('k2');
  });
});

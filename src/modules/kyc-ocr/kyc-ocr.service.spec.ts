import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { KycOcrService } from './kyc-ocr.service';
import { MockOcrProvider } from './providers/mock-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';

describe('KycOcrService', () => {
  let service: KycOcrService;
  let mockProvider: { extract: jest.Mock };
  let googleProvider: { extract: jest.Mock };

  beforeEach(async () => {
    mockProvider = {
      extract: jest.fn().mockResolvedValue({
        fullName: 'Jane Doe',
        documentNumber: 'AB123456',
        dateOfBirth: '1990-01-01',
        expiryDate: '2030-01-01',
        nationality: 'NG',
        confidence: 92,
      }),
    };
    googleProvider = {
      extract: jest.fn().mockResolvedValue({ confidence: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycOcrService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mock') },
        },
        { provide: MockOcrProvider, useValue: mockProvider },
        { provide: GoogleVisionOcrProvider, useValue: googleProvider },
      ],
    }).compile();

    service = module.get(KycOcrService);
  });

  it('extracts and normalises fields via mock provider fixture', async () => {
    const result = await service.extractForApplication('app-1', 's3://img.jpg');

    expect(mockProvider.extract).toHaveBeenCalledWith('s3://img.jpg');
    expect(result.fullName).toBe('Jane Doe');
    expect(result.documentNumber).toBe('AB123456');
    expect(result.dateOfBirth).toBe('1990-01-01');
    expect(result.confidence).toBe(92);
    expect(result.kycApplicationId).toBe('app-1');
    expect(result.provider).toBeTruthy();
    expect(result.likelyExpired).toBe(false);
    expect(result.documentNumberMismatch).toBe(false);
  });

  it('flags document number mismatch when submitted number differs', async () => {
    const result = await service.extractForApplication(
      'app-2',
      'img',
      'WRONG999',
    );
    expect(result.documentNumberMismatch).toBe(true);
  });

  it('flags likelyExpired when expiry is in the past', async () => {
    mockProvider.extract.mockResolvedValueOnce({
      fullName: 'Old Doc',
      documentNumber: 'OLD1',
      expiryDate: '2000-01-01',
      confidence: 80,
    });

    const result = await service.extractForApplication('app-3', 'img');
    expect(result.likelyExpired).toBe(true);
  });

  it('surfaces low-confidence extraction without inventing default name fields', async () => {
    mockProvider.extract.mockResolvedValueOnce({ confidence: 0 });

    const result = await service.extractForApplication('app-4', 'img');
    expect(result.confidence).toBe(0);
    expect(result.fullName).toBeUndefined();
    expect(result.documentNumber).toBeUndefined();
  });

  it('getResult throws when no OCR result stored', () => {
    expect(() => service.getResult('missing')).toThrow(NotFoundException);
  });

  it('getResult returns previously stored extraction', async () => {
    await service.extractForApplication('app-5', 'img');
    const stored = service.getResult('app-5');
    expect(stored.kycApplicationId).toBe('app-5');
    expect(stored.documentNumber).toBe('AB123456');
  });
});

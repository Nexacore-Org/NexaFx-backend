import { Test, TestingModule } from '@nestjs/testing';
import { AiKycDocVerificationService } from './ai-kyc-doc-verification.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KycDocVerificationResult, KycVerificationDecision } from './entities/kyc-doc-verification-result.entity';
import { KYCApplication, KycStatus } from '../kyc/entities/kyc-application.entity';
import { KycService } from '../kyc/kyc.service';
import { Repository } from 'typeorm';

describe('AiKycDocVerificationService', () => {
  let service: AiKycDocVerificationService;
  let verificationResultRepository: Repository<KycDocVerificationResult>;
  let kycRepository: Repository<KYCApplication>;
  let kycService: KycService;

  const mockVerificationResultRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockKycRepository = {
    findOne: jest.fn(),
  };

  const mockKycService = {
    approveKyc: jest.fn(),
    rejectKyc: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiKycDocVerificationService,
        {
          provide: getRepositoryToken(KycDocVerificationResult),
          useValue: mockVerificationResultRepository,
        },
        {
          provide: getRepositoryToken(KYCApplication),
          useValue: mockKycRepository,
        },
        {
          provide: KycService,
          useValue: mockKycService,
        },
      ],
    }).compile();

    service = module.get<AiKycDocVerificationService>(AiKycDocVerificationService);
    verificationResultRepository = module.get<Repository<KycDocVerificationResult>>(getRepositoryToken(KycDocVerificationResult));
    kycRepository = module.get<Repository<KYCApplication>>(getRepositoryToken(KYCApplication));
    kycService = module.get<KycService>(KycService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyApplication', () => {
    it('should PASS verification and auto-approve KYC when all fields match and are valid', async () => {
      const mockKyc = {
        id: 'kyc-1',
        status: KycStatus.PENDING,
        user: {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-01'),
        },
      } as unknown as KYCApplication;

      mockKycRepository.findOne.mockResolvedValue(mockKyc);
      mockVerificationResultRepository.create.mockImplementation((dto) => dto);
      mockVerificationResultRepository.save.mockImplementation((dto) => Promise.resolve(dto));

      const ocrData = {
        documentType: 'PASSPORT',
        confidenceScore: 0.95,
        faceMatchScore: 0.90,
        extractedFields: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          expiryDate: '2030-01-01',
          documentNumber: 'P123',
        },
      };

      const result = await service.verifyApplication('kyc-1', ocrData);

      expect(result.decision).toBe(KycVerificationDecision.PASS);
      expect(kycService.approveKyc).toHaveBeenCalledWith('kyc-1', 'SYSTEM_AI');
      expect(kycService.rejectKyc).not.toHaveBeenCalled();
    });

    it('should FAIL verification and auto-reject KYC if document is expired', async () => {
      const mockKyc = {
        id: 'kyc-2',
        status: KycStatus.PENDING,
        user: {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
        },
      } as unknown as KYCApplication;

      mockKycRepository.findOne.mockResolvedValue(mockKyc);
      mockVerificationResultRepository.create.mockImplementation((dto) => dto);
      mockVerificationResultRepository.save.mockImplementation((dto) => Promise.resolve(dto));

      const ocrData = {
        documentType: 'PASSPORT',
        confidenceScore: 0.95,
        faceMatchScore: 0.90,
        extractedFields: {
          firstName: 'John',
          lastName: 'Doe',
          expiryDate: '2020-01-01', // in the past
        },
      };

      const result = await service.verifyApplication('kyc-2', ocrData);

      expect(result.decision).toBe(KycVerificationDecision.FAIL);
      expect(result.reason).toContain('Document is expired');
      expect(kycService.rejectKyc).toHaveBeenCalledWith('kyc-2', 'SYSTEM_AI', expect.any(String), true);
      expect(kycService.approveKyc).not.toHaveBeenCalled();
    });

    it('should REVIEW verification and NOT auto-approve/reject if there are warnings (like borderline scores)', async () => {
      const mockKyc = {
        id: 'kyc-3',
        status: KycStatus.PENDING,
        user: {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
        },
      } as unknown as KYCApplication;

      mockKycRepository.findOne.mockResolvedValue(mockKyc);
      mockVerificationResultRepository.create.mockImplementation((dto) => dto);
      mockVerificationResultRepository.save.mockImplementation((dto) => Promise.resolve(dto));

      const ocrData = {
        documentType: 'PASSPORT',
        confidenceScore: 0.95,
        faceMatchScore: 0.78, // borderline (0.70 - 0.85)
        extractedFields: {
          firstName: 'John',
          lastName: 'Doe',
          expiryDate: '2030-01-01',
        },
      };

      const result = await service.verifyApplication('kyc-3', ocrData);

      expect(result.decision).toBe(KycVerificationDecision.REVIEW);
      expect(kycService.approveKyc).not.toHaveBeenCalled();
      expect(kycService.rejectKyc).not.toHaveBeenCalled();
    });
  });
});

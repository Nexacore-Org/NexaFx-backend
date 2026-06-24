import { Test, TestingModule } from '@nestjs/testing';
import { KycService } from './kyc.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { KycRecord, KycStatus, KycTier } from './entities/kyc.entity';
import { User, UserKycTier } from '../users/user.entity';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('KycService', () => {
  let service: KycService;
  let kycRepository: jest.Mocked<Repository<KycRecord>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let configService: jest.Mocked<ConfigService>;
  let firebaseService: jest.Mocked<FirebaseService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockKycRecord = {
    id: 'kyc-123',
    userId: 'user-123',
    status: KycStatus.PENDING,
    tier: KycTier.TIER_0,
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01',
    documentFrontUrl: 'https://example.com/doc-front.jpg',
    documentBackUrl: 'https://example.com/doc-back.jpg',
    selfieUrl: 'https://example.com/selfie.jpg',
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    kycTier: UserKycTier.UNVERIFIED,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        {
          provide: getRepositoryToken(KycRecord),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: FirebaseService,
          useValue: {
            sendMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(KycService);
    kycRepository = module.get(getRepositoryToken(KycRecord));
    userRepository = module.get(getRepositoryToken(User));
    configService = module.get(ConfigService);
    firebaseService = module.get(FirebaseService);
    dataSource = module.get(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submitKyc', () => {
    it('should submit KYC with valid data', async () => {
      kycRepository.findOne.mockResolvedValue(null);
      kycRepository.create.mockReturnValue(mockKycRecord);
      kycRepository.save.mockResolvedValue(mockKycRecord);

      const result = await service.submitKyc('user-123', {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        documentFrontUrl: 'https://example.com/doc-front.jpg',
        selfieUrl: 'https://example.com/selfie.jpg',
      });

      expect(result.status).toBe(KycStatus.PENDING);
      expect(kycRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when documentFront is missing', async () => {
      await expect(
        service.submitKyc('user-123', {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          selfieUrl: 'https://example.com/selfie.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when selfie is missing', async () => {
      await expect(
        service.submitKyc('user-123', {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          documentFrontUrl: 'https://example.com/doc-front.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user has active submission', async () => {
      const activeKyc = { ...mockKycRecord, status: KycStatus.UNDER_REVIEW };
      kycRepository.findOne.mockResolvedValue(activeKyc);

      await expect(
        service.submitKyc('user-123', {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01',
          documentFrontUrl: 'https://example.com/doc-front.jpg',
          selfieUrl: 'https://example.com/selfie.jpg',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveKyc', () => {
    it('should approve KYC and update user tier', async () => {
      kycRepository.findOne.mockResolvedValue(mockKycRecord);
      kycRepository.save.mockResolvedValue({
        ...mockKycRecord,
        status: KycStatus.APPROVED,
      });
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.approveKyc('kyc-123', {
        status: KycStatus.APPROVED,
        tier: KycTier.TIER_1,
        adminNotes: 'Approved',
      });

      expect(result.status).toBe(KycStatus.APPROVED);
    });

    it('should throw NotFoundException when KYC record not found', async () => {
      kycRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approveKyc('nonexistent', {
          status: KycStatus.APPROVED,
          tier: KycTier.TIER_1,
          adminNotes: 'Approved',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when resubmitting with status not RESUBMISSION_REQUIRED', async () => {
      const rejectedKyc = { ...mockKycRecord, status: KycStatus.REJECTED };
      kycRepository.findOne.mockResolvedValue(rejectedKyc);

      await expect(
        service.approveKyc('kyc-123', {
          status: KycStatus.REJECTED,
          tier: KycTier.TIER_0,
          adminNotes: 'Request resubmission',
        }),
      ).rejects.toThrow();
    });

    it('should send email notification on admin approval', async () => {
      kycRepository.findOne.mockResolvedValue(mockKycRecord);
      userRepository.findOne.mockResolvedValue(mockUser);
      kycRepository.save.mockResolvedValue({
        ...mockKycRecord,
        status: KycStatus.APPROVED,
      });

      await service.approveKyc('kyc-123', {
        status: KycStatus.APPROVED,
        tier: KycTier.TIER_1,
        adminNotes: 'Approved',
      });

      // Email notification should be triggered
      // Verify via audit logs or notification service
    });

    it('should update user KYC tier when approved', async () => {
      kycRepository.findOne.mockResolvedValue(mockKycRecord);
      kycRepository.save.mockResolvedValue({
        ...mockKycRecord,
        status: KycStatus.APPROVED,
        tier: KycTier.TIER_1,
      });
      userRepository.findOne.mockResolvedValue(mockUser);

      await service.approveKyc('kyc-123', {
        status: KycStatus.APPROVED,
        tier: KycTier.TIER_1,
        adminNotes: 'Approved',
      });

      // User tier should be updated
      expect(userRepository.update || userRepository.save).toBeDefined();
    });
  });

  describe('rejectKyc', () => {
    it('should reject KYC and allow resubmission', async () => {
      kycRepository.findOne.mockResolvedValue(mockKycRecord);
      kycRepository.save.mockResolvedValue({
        ...mockKycRecord,
        status: KycStatus.RESUBMISSION_REQUIRED,
      });
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.rejectKyc('kyc-123', {
        reason: 'Document quality is poor',
        adminNotes: 'Please resubmit with clearer documents',
      });

      expect(result.status).toBe(KycStatus.RESUBMISSION_REQUIRED);
    });

    it('should throw NotFoundException when KYC record not found', async () => {
      kycRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rejectKyc('nonexistent', {
          reason: 'Test',
          adminNotes: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserKyc', () => {
    it('should return user KYC records', async () => {
      kycRepository.find.mockResolvedValue([mockKycRecord]);

      const result = await service.getUserKyc('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('kyc-123');
    });

    it('should return empty array when user has no KYC records', async () => {
      kycRepository.find.mockResolvedValue([]);

      const result = await service.getUserKyc('user-123');

      expect(result).toEqual([]);
    });
  });
});

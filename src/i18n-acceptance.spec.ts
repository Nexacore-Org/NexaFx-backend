import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType, ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { I18nModule, AcceptLanguageResolver, I18nService } from 'nestjs-i18n';
import { join } from 'path';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { KycEmailService } from './kyc/kyc-email.service';
import { Repository, DataSource } from 'typeorm';
import { User, UserKycTier } from './users/user.entity';
import { KycService } from './kyc/kyc.service';
import { KycStatus, KycRecord } from './kyc/entities/kyc.entity';
import { FirebaseService } from './firebase/firebase.service';
import { WebhookService } from './webhooks/services/webhook.service';
import { STORAGE_SERVICE_TOKEN } from './modules/storage/storage.service';
import { Notification } from './notifications/entities/notification.entity';
import { RateLimitConfig } from './users/rate-limit-config.entity';
import { PasswordResetAttempt } from './auth/entities/password-reset-attempt.entity';
import { OAuthAccount } from './auth/entities/oauth-account.entity';
import { OtpsService } from './otps/otps.service';
import { RefreshTokensService } from './tokens/refresh-tokens.service';
import { OtpDeliveryService } from './auth/email/otp-delivery.service';
import { JwtService } from '@nestjs/jwt';
import { StellarService } from './blockchain/stellar/stellar.service';
import { EncryptionService } from './common/services/encryption.service';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { ReferralsService } from './referrals/referrals.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { WalletsService } from './wallets/wallets.service';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { NotificationPreferenceService } from './notifications/services/notification-preference.service';
import { RedisService } from './common/services/redis.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ExchangeRatesService } from './exchange-rates/exchange-rates.service';
import { DataExportService } from './users/services/data-export.service';
import { AccountDeletionService } from './users/services/account-deletion.service';
import { TransactionLimitService } from './transactions/services/transaction-limit.service';

jest.mock('firebase-admin', () => ({
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
  auth: () => ({
    verifyIdToken: jest
      .fn()
      .mockResolvedValue({ uid: 'mock-uid', email: 'test@example.com' }),
    getUser: jest
      .fn()
      .mockResolvedValue({ uid: 'mock-uid', email: 'test@example.com' }),
  }),
  messaging: () => ({
    send: jest.fn().mockResolvedValue('mock-message-id'),
  }),
}));

jest.mock('stellar-sdk', () => ({
  Server: jest.fn().mockImplementation(() => ({
    loadAccount: jest.fn().mockResolvedValue({ balances: [] }),
    submitTransaction: jest.fn().mockResolvedValue({ successful: true }),
  })),
  Keypair: {
    random: jest.fn().mockReturnValue({
      publicKey: () => 'mock-public-key',
      secret: () => 'mock-secret',
    }),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
  TransactionBuilder: jest.fn(),
  Asset: { native: jest.fn() },
  Operation: { payment: jest.fn() },
}));

describe('I18n Acceptance Criteria', () => {
  describe('POST /v2/auth/login wrong password E2E', () => {
    let app: INestApplication;
    let findByEmailMock: jest.Mock;

    beforeAll(async () => {
      findByEmailMock = jest.fn();
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          I18nModule.forRootAsync({
            useFactory: () => ({
              fallbackLanguage: 'en',
              loaderOptions: {
                path: join(__dirname, '../src/i18n/'),
                watch: true,
              },
            }),
            resolvers: [AcceptLanguageResolver],
          }),
        ],
        controllers: [AuthController],
        providers: [
          AuthService,
          {
            provide: UsersService,
            useValue: { findByEmail: findByEmailMock },
          },
          {
            provide: OtpsService,
            useValue: { generateOtp: jest.fn() },
          },
          {
            provide: RefreshTokensService,
            useValue: {},
          },
          {
            provide: OtpDeliveryService,
            useValue: {},
          },
          {
            provide: JwtService,
            useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
          {
            provide: StellarService,
            useValue: {},
          },
          {
            provide: EncryptionService,
            useValue: { encrypt: jest.fn(), decrypt: jest.fn() },
          },
          {
            provide: AuditLogsService,
            useValue: { logAuthEvent: jest.fn() },
          },
          {
            provide: ReferralsService,
            useValue: {},
          },
          {
            provide: TwoFactorService,
            useValue: {},
          },
          {
            provide: WalletsService,
            useValue: {},
          },
          {
            provide: getRepositoryToken(PasswordResetAttempt),
            useValue: {},
          },
          {
            provide: getRepositoryToken(OAuthAccount),
            useValue: {},
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      findByEmailMock.mockReset();
    });

    it('returns literal French error with Accept-Language: fr', async () => {
      findByEmailMock.mockResolvedValueOnce({
        id: 'user-fr-123',
        email: 'fr@example.com',
        isVerified: true,
        isActive: true,
        password: '$2b$12$abcdefghijklmnopqrstuv',
      });

      const response = await request(app.getHttpServer())
        .post('/v2/auth/login')
        .set('Accept-Language', 'fr')
        .send({ email: 'fr@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Identifiants invalides');
    });

    it('returns literal Arabic error with Accept-Language: ar', async () => {
      findByEmailMock.mockResolvedValueOnce({
        id: 'user-ar-123',
        email: 'ar@example.com',
        isVerified: true,
        isActive: true,
        password: '$2b$12$abcdefghijklmnopqrstuv',
      });

      const response = await request(app.getHttpServer())
        .post('/v2/auth/login')
        .set('Accept-Language', 'ar')
        .send({ email: 'ar@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('بيانات الاعتماد غير صالحة');
    });
  });

  describe('GET/PATCH /v2/users/me persistence and isRtl E2E', () => {
    let app: INestApplication;
    let findOneSpy: jest.SpyInstance;
    let updateSpy: jest.SpyInstance;

    const baseUser = {
      id: 'user-persist-123',
      email: 'persist@example.com',
      preferredLanguage: 'en',
      kycTier: 'UNVERIFIED',
      role: 'USER',
      plan: 'FREE',
      isActive: true,
      isVerified: false,
      isEmailVerified: false,
      isSuspended: false,
      isTwoFactorEnabled: false,
      failedLoginAttempts: 0,
      isDeleted: false,
      lockedUntil: null,
      walletPublicKey: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
      walletSecretKeyEncrypted: 'encrypted',
      password: null,
      passwordHash: undefined,
      twoFactorSecret: null,
      balances: {},
      fcmTokens: [],
      referralCode: 'PERSIST12',
      referredBy: null,
      firstName: 'Persist',
      lastName: 'Test',
      phone: null,
      balanceLastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let mockDbUser: any;

    beforeAll(async () => {
      mockDbUser = { ...baseUser };

      const mockUserRepo = {
        findOne: jest.fn().mockImplementation(async (options: any) => {
          return mockDbUser;
        }),
        update: jest.fn().mockImplementation(async (id: any, data: any) => {
          mockDbUser = { ...mockDbUser, ...data };
          return { affected: 1, raw: [], generated: [] } as any;
        }),
      };

      findOneSpy = jest.spyOn(mockUserRepo, 'findOne');
      updateSpy = jest.spyOn(mockUserRepo, 'update');

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          I18nModule.forRootAsync({
            useFactory: () => ({
              fallbackLanguage: 'en',
              loaderOptions: {
                path: join(__dirname, '../src/i18n/'),
                watch: true,
              },
            }),
            resolvers: [AcceptLanguageResolver],
          }),
        ],
        controllers: [UsersController],
        providers: [
          UsersService,
          {
            provide: APP_GUARD,
            useValue: {
              canActivate: (context: ExecutionContext) => {
                const req = context.switchToHttp().getRequest();
                req.user = { userId: 'user-persist-123' };
                return true;
              },
            },
          },
          {
            provide: getRepositoryToken(User),
            useValue: mockUserRepo,
          },
          {
            provide: getRepositoryToken(RateLimitConfig),
            useValue: {},
          },
          {
            provide: StellarService,
            useValue: {},
          },
          {
            provide: ExchangeRatesService,
            useValue: {},
          },
          {
            provide: ThrottlerStorageService,
            useValue: { storage: new Map() },
          },
          {
            provide: NotificationPreferenceService,
            useValue: { createDefaults: jest.fn() },
          },
          {
            provide: RedisService,
            useValue: { del: jest.fn() },
          },
          {
            provide: DataExportService,
            useValue: {},
          },
          {
            provide: AccountDeletionService,
            useValue: {},
          },
          {
            provide: TransactionLimitService,
            useValue: {},
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      mockDbUser = { ...baseUser };
      findOneSpy.mockClear();
      updateSpy.mockClear();
    });

    it('returns default preferredLanguage: en and isRtl: false on GET', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/users/me')
        .expect(200);

      expect(response.body.preferredLanguage).toBe('en');
      expect(response.body.isRtl).toBe(false);
      expect(findOneSpy).toHaveBeenCalled();
    });

    it('persists preferredLanguage: ar on PATCH and updates isRtl to true', async () => {
      const patchResponse = await request(app.getHttpServer())
        .patch('/v2/users/me')
        .send({ preferredLanguage: 'ar' })
        .expect(200);

      expect(patchResponse.body.preferredLanguage).toBe('ar');
      expect(patchResponse.body.isRtl).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith('user-persist-123', {
        preferredLanguage: 'ar',
      });

      const getResponse = await request(app.getHttpServer())
        .get('/v2/users/me')
        .expect(200);

      expect(getResponse.body.preferredLanguage).toBe('ar');
      expect(getResponse.body.isRtl).toBe(true);
    });

    it('returns isRtl: false for preferredLanguage: fr', async () => {
      const patchResponse = await request(app.getHttpServer())
        .patch('/v2/users/me')
        .send({ preferredLanguage: 'fr' })
        .expect(200);

      expect(patchResponse.body.preferredLanguage).toBe('fr');
      expect(patchResponse.body.isRtl).toBe(false);
    });
  });

  describe('KYC email language selection tests', () => {
    let i18nService: I18nService;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          I18nModule.forRootAsync({
            useFactory: () => ({
              fallbackLanguage: 'en',
              loaderOptions: {
                path: join(__dirname, '../src/i18n/'),
                watch: true,
              },
            }),
            resolvers: [AcceptLanguageResolver],
          }),
        ],
      }).compile();

      i18nService = moduleRef.get<I18nService>(I18nService);
    });

    it('selects French for KycEmailService.sendApprovalEmail when user preferredLanguage is fr', async () => {
      const mockUserRepository = {
        findOne: jest.fn().mockResolvedValue({
          preferredLanguage: 'fr',
        } as User),
      } as unknown as Repository<User>;

      const configService = { get: jest.fn().mockReturnValue('false') } as any;
      const kycEmailService = new KycEmailService(
        configService,
        i18nService,
        mockUserRepository,
      );

      const sendEmailSpy = jest
        .spyOn(kycEmailService as any, 'sendEmail')
        .mockResolvedValue(undefined);

      await kycEmailService.sendApprovalEmail('fr-user@example.com', 'Jean Dupont');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'fr-user@example.com' },
      });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      const [to, subject, html, text] = sendEmailSpy.mock.calls[0];
      expect(to).toBe('fr-user@example.com');
      expect(subject).toBe('Votre vérification KYC a été approuvée');
      expect(text).toContain('Jean Dupont');
      expect(text).toContain('vérification KYC');
      expect(html).toContain('KYC Approuvé ✅');
      expect(html).toContain('Jean Dupont');
      expect(html).toContain('compte est désormais entièrement vérifié');
    });

    it('selects English for KycEmailService.sendApprovalEmail when user preferredLanguage is en', async () => {
      const mockUserRepository = {
        findOne: jest.fn().mockResolvedValue({
          preferredLanguage: 'en',
        } as User),
      } as unknown as Repository<User>;

      const configService = { get: jest.fn().mockReturnValue('false') } as any;
      const kycEmailService = new KycEmailService(
        configService,
        i18nService,
        mockUserRepository,
      );

      const sendEmailSpy = jest
        .spyOn(kycEmailService as any, 'sendEmail')
        .mockResolvedValue(undefined);

      await kycEmailService.sendApprovalEmail('en-user@example.com', 'John Doe');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'en-user@example.com' },
      });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      const [to, subject, html, text] = sendEmailSpy.mock.calls[0];
      expect(to).toBe('en-user@example.com');
      expect(subject).toBe('Your KYC Verification Has Been Approved');
      expect(text).toContain('John Doe');
      expect(text).toContain('KYC verification has been approved');
      expect(html).toContain('KYC Approved ✅');
      expect(html).toContain('John Doe');
      expect(html).toContain('fully verified');
    });

    it('selects Arabic for KycEmailService.sendApprovalEmail when user preferredLanguage is ar', async () => {
      const mockUserRepository = {
        findOne: jest.fn().mockResolvedValue({
          preferredLanguage: 'ar',
        } as User),
      } as unknown as Repository<User>;

      const configService = { get: jest.fn().mockReturnValue('false') } as any;
      const kycEmailService = new KycEmailService(
        configService,
        i18nService,
        mockUserRepository,
      );

      const sendEmailSpy = jest
        .spyOn(kycEmailService as any, 'sendEmail')
        .mockResolvedValue(undefined);

      await kycEmailService.sendApprovalEmail('ar-user@example.com', 'أحمد');

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'ar-user@example.com' },
      });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      const [to, subject, html, text] = sendEmailSpy.mock.calls[0];
      expect(to).toBe('ar-user@example.com');
      expect(subject).toBe('تمت الموافقة على طلب التحقق الخاص بك (KYC)');
      expect(text).toContain('أحمد');
      expect(text).toContain('لقد تمت الموافقة على طلب التحقق من الهوية الخاص بك');
      expect(html).toContain('تمت الموافقة على التحقق من الهوية ✅');
      expect(html).toContain('أحمد');
      expect(html).toContain('حسابك الآن موثق بالكامل');
    });

    it('selects French for KycEmailService.sendRejectionEmail when user preferredLanguage is fr', async () => {
      const mockUserRepository = {
        findOne: jest.fn().mockResolvedValue({
          preferredLanguage: 'fr',
        } as User),
      } as unknown as Repository<User>;

      const configService = { get: jest.fn().mockReturnValue('false') } as any;
      const kycEmailService = new KycEmailService(
        configService,
        i18nService,
        mockUserRepository,
      );

      const sendEmailSpy = jest
        .spyOn(kycEmailService as any, 'sendEmail')
        .mockResolvedValue(undefined);

      await kycEmailService.sendRejectionEmail(
        'fr-user@example.com',
        'Jean Dupont',
        'Le document est flou',
        true,
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'fr-user@example.com' },
      });
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);

      const [to, subject, html, text] = sendEmailSpy.mock.calls[0];
      expect(to).toBe('fr-user@example.com');
      expect(subject).toBe('Nouvelle soumission KYC requise');
      expect(text).toContain('Jean Dupont');
      expect(text).toContain('soumission KYC nécessite des modifications');
      expect(text).toContain('Le document est flou');
      expect(html).toContain('Nouvelle soumission requise 🔄');
      expect(html).toContain('Le document est flou');
    });
  });

  describe('KycService.rejectKyc integration', () => {
    let kycService: KycService;
    let mockManager: any;
    let mockKycRecord: any;
    let mockUser: any;
    let sendRejectionEmailSpy: jest.SpyInstance;
    let sendToTokensSpy: jest.SpyInstance;
    let dispatchSpy: jest.SpyInstance;

    beforeEach(async () => {
      mockKycRecord = {
        id: 'kyc-789',
        userId: 'user-456',
        status: KycStatus.PENDING,
        rejectionReason: '',
        reviewedBy: '',
        reviewedAt: null,
      };

      mockUser = {
        id: 'user-456',
        email: 'test@example.com',
        firstName: 'Test',
        isVerified: true,
        kycTier: UserKycTier.BASIC,
        fcmTokens: ['fcm-token-123'],
      };

      mockManager = {
        findOne: jest.fn().mockImplementation(async (entity: any, options: any) => {
          if (entity === KycRecord) return mockKycRecord;
          if (entity === User) return mockUser;
          return null;
        }),
        save: jest.fn().mockResolvedValue(undefined),
      };

      const mockDataSource = {
        transaction: jest.fn().mockImplementation(async (cb: any) => {
          return cb(mockManager);
        }),
      };

      const mockFirebaseService = {
        sendToTokens: jest.fn().mockResolvedValue(undefined),
      };

      const mockWebhookService = {
        dispatch: jest.fn().mockResolvedValue(undefined),
      };

      const mockKycEmailService = {
        sendRejectionEmail: jest.fn().mockResolvedValue(undefined),
      };

      sendToTokensSpy = jest.spyOn(mockFirebaseService, 'sendToTokens');
      dispatchSpy = jest.spyOn(mockWebhookService, 'dispatch');
      sendRejectionEmailSpy = jest.spyOn(mockKycEmailService, 'sendRejectionEmail');

      const moduleRef = await Test.createTestingModule({
        providers: [
          KycService,
          { provide: getRepositoryToken(KycRecord), useValue: {} },
          { provide: getRepositoryToken(User), useValue: {} },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          { provide: DataSource, useValue: mockDataSource },
          { provide: FirebaseService, useValue: mockFirebaseService },
          { provide: WebhookService, useValue: mockWebhookService },
          { provide: KycEmailService, useValue: mockKycEmailService },
          { provide: STORAGE_SERVICE_TOKEN, useValue: {} },
        ],
      }).compile();

      kycService = moduleRef.get<KycService>(KycService);
    });

    it('successfully rejects KYC, updates state, and dispatches notifications/emails/webhooks', async () => {
      const result = await kycService.rejectKyc('kyc-789', 'admin-1', 'ID document is invalid', false);

      expect(result.message).toBe('KYC rejected successfully');

      expect(mockKycRecord.status).toBe(KycStatus.REJECTED);
      expect(mockKycRecord.rejectionReason).toBe('ID document is invalid');
      expect(mockKycRecord.reviewedBy).toBe('admin-1');
      expect(mockKycRecord.reviewedAt).toBeInstanceOf(Date);

      expect(mockUser.isVerified).toBe(false);
      expect(mockUser.kycTier).toBe(UserKycTier.UNVERIFIED);

      expect(mockManager.save).toHaveBeenCalledWith(mockKycRecord);
      expect(mockManager.save).toHaveBeenCalledWith(mockUser);
      expect(mockManager.save).toHaveBeenCalledWith(Notification, expect.any(Object));

      expect(sendRejectionEmailSpy).toHaveBeenCalledWith(
        'test@example.com',
        'Test',
        'ID document is invalid',
        false,
      );

      expect(sendToTokensSpy).toHaveBeenCalledWith(
        ['fcm-token-123'],
        'KYC Rejected',
        'Your KYC submission was rejected. Reason: ID document is invalid',
        { entity: 'KYC', kycStatus: 'rejected' },
        expect.any(Object),
      );

      expect(dispatchSpy).toHaveBeenCalledWith('kyc.rejected', mockKycRecord, 'user-456');
    });

    it('successfully requests resubmission for KYC, updates status to RESUBMISSION_REQUIRED', async () => {
      const result = await kycService.rejectKyc('kyc-789', 'admin-1', 'ID document blurry', true);

      expect(result.message).toBe('KYC resubmission requested successfully');
      expect(mockKycRecord.status).toBe(KycStatus.RESUBMISSION_REQUIRED);
      expect(mockUser.isVerified).toBe(false);

      expect(sendRejectionEmailSpy).toHaveBeenCalledWith(
        'test@example.com',
        'Test',
        'ID document blurry',
        true,
      );
      expect(sendToTokensSpy).toHaveBeenCalledWith(
        ['fcm-token-123'],
        'KYC Resubmission Required',
        'Your KYC submission requires changes. Reason: ID document blurry',
        { entity: 'KYC', kycStatus: 'resubmission_required' },
        expect.any(Object),
      );
      expect(dispatchSpy).toHaveBeenCalledWith('kyc.resubmission_required', mockKycRecord, 'user-456');
    });
  });
});

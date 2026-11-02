jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  getRepositoryToken: (entity: { name?: string }) =>
    `${entity?.name ?? 'Entity'}Repository`,
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
  ApiTags: () => () => undefined,
  ApiOperation: () => () => undefined,
  ApiResponse: () => () => undefined,
  ApiBearerAuth: () => () => undefined,
}));

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => undefined,
  WebSocketServer: () => () => undefined,
  SubscribeMessage: () => () => undefined,
}));

jest.mock('../firebase/firebase.service', () => ({
  FirebaseService: class FirebaseService {},
}));

jest.mock('../webhooks/services/webhook.service', () => ({
  WebhookService: class WebhookService {},
}));

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));

jest.mock('../unified-activity-feed/unified-activity-feed.service', () => ({
  UnifiedActivityFeedService: class UnifiedActivityFeedService {},
}));

jest.mock('../sanctions/sanctions.service', () => ({
  SanctionsService: class SanctionsService {},
}));

jest.mock('../common/helpers/virus-scanner.helper', () => ({
  scanBuffer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../common/helpers/video-duration-scanner.helper', () => ({
  validateSelfieVideo: jest.fn().mockResolvedValue(undefined),
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Readable } from 'stream';
import { DataSource, Repository } from 'typeorm';
import { KycService } from './kyc.service';
import { KYCApplication, KycStatus } from './entities/kyc-application.entity';
import { User, UserKycTier } from '../users/user.entity';
import { FirebaseService } from '../firebase/firebase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookService } from '../webhooks/services/webhook.service';
import { StorageService } from '../modules/storage/storage.service';
import { UnifiedActivityFeedService } from '../unified-activity-feed/unified-activity-feed.service';
import { SanctionsService } from '../sanctions/sanctions.service';
import { ScreeningStatus } from '../sanctions/entities/kyc-screening.entity';

describe('KycService — Duplicate Pending & Concurrent Review Races (#1499)', () => {
  let service: KycService;
  let kycRepository: jest.Mocked<Partial<Repository<KYCApplication>>>;
  let userRepository: jest.Mocked<Partial<Repository<User>>>;
  let storageService: jest.Mocked<StorageService>;
  let webhookService: { dispatch: jest.Mock };
  let activityFeedService: { append: jest.Mock };
  let sanctionsService: { screenUser: jest.Mock };

  const makeFile = (
    fieldname: string,
    originalname = `${fieldname}.jpg`,
    mimetype = 'image/jpeg',
  ): Express.Multer.File => ({
    fieldname,
    originalname,
    encoding: '7bit',
    mimetype,
    size: 16,
    destination: '',
    filename: originalname,
    path: '',
    buffer: Buffer.from('file-bytes'),
    stream: new Readable(),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'u1',
        kycTier: UserKycTier.BASIC,
        fcmTokens: [],
      } as unknown as User),
    };

    storageService = {
      upload: jest
        .fn()
        .mockImplementation(
          async (file: Express.Multer.File, dir: string) =>
            `${dir}/${file.originalname}`,
        ),
      getSignedUrl: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    webhookService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    activityFeedService = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    sanctionsService = {
      screenUser: jest
        .fn()
        .mockResolvedValue({ status: ScreeningStatus.CLEAR }),
    };
  });

  it('produces exactly one PENDING application and one 409 ConflictException on two concurrent applyForKyc calls', async () => {
    let pendingSaved = false;
    kycRepository = {
      // Both concurrent requests initially see no PENDING application before uploads finish
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => dto as KYCApplication),
      save: jest.fn(async (entity) => {
        if (pendingSaved) {
          const uniqueErr = Object.assign(
            new Error(
              'duplicate key value violates unique constraint "UQ_kyc_applications_user_pending"',
            ),
            { code: '23505' },
          );
          throw uniqueErr;
        }
        pendingSaved = true;
        return entity as KYCApplication;
      }),
    };

    service = new KycService(
      kycRepository as Repository<KYCApplication>,
      userRepository as Repository<User>,
      { transaction: jest.fn() } as unknown as DataSource,
      { sendToTokens: jest.fn() } as unknown as FirebaseService,
      {} as NotificationsService,
      webhookService as unknown as WebhookService,
      storageService,
      activityFeedService as unknown as UnifiedActivityFeedService,
      sanctionsService as unknown as SanctionsService,
    );

    const files = {
      governmentIdFront: makeFile('governmentIdFront', 'front.jpg'),
      selfie: makeFile('selfie', 'selfie.jpg'),
    };

    const results = await Promise.allSettled([
      service.applyForKyc('u1', UserKycTier.STANDARD, files),
      service.applyForKyc('u1', UserKycTier.STANDARD, files),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.status).toBe(KycStatus.PENDING);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason.getStatus()).toBe(409);
  });

  it('uses pessimistic_write row locking in approveKyc, rejectKyc, and resubmitKyc so concurrent approve and reject produce one decision and one 400', async () => {
    const sharedApplication: KYCApplication = {
      id: 'app-1',
      userId: 'u1',
      targetTier: UserKycTier.STANDARD,
      status: KycStatus.PENDING,
      documents: {
        governmentIdFront: {
          s3Key: 'kyc/u1/front.jpg',
          mimeType: 'image/jpeg',
        },
        selfie: { s3Key: 'kyc/u1/selfie.jpg', mimeType: 'image/jpeg' },
      },
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {} as User,
      reviewer: null,
    };

    const findOneCalls: any[] = [];
    // Serialize transactions just as PostgreSQL FOR UPDATE row locks do
    let txChain = Promise.resolve();

    const dataSourceMock: Partial<DataSource> = {
      transaction: jest.fn((cb: any) => {
        const next = txChain.then(() =>
          cb({
            findOne: jest.fn(async (entity: any, options: any) => {
              findOneCalls.push({ entity, options });
              if (entity === KYCApplication) {
                return sharedApplication;
              }
              if (entity === User) {
                return {
                  id: 'u1',
                  kycTier: UserKycTier.BASIC,
                  fcmTokens: [],
                };
              }
              return null;
            }),
            save: jest.fn(async (...args: unknown[]) => args[args.length - 1]),
          }),
        );
        txChain = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      }),
    };

    service = new KycService(
      {} as Repository<KYCApplication>,
      userRepository as Repository<User>,
      dataSourceMock as DataSource,
      { sendToTokens: jest.fn() } as unknown as FirebaseService,
      {} as NotificationsService,
      webhookService as unknown as WebhookService,
      storageService,
      activityFeedService as unknown as UnifiedActivityFeedService,
      sanctionsService as unknown as SanctionsService,
    );

    const [approveOutcome, rejectOutcome] = await Promise.allSettled([
      service.approveKyc('app-1', 'reviewer-1'),
      service.rejectKyc('app-1', 'reviewer-2', 'Blurry ID', false),
    ]);

    expect(approveOutcome.status).toBe('fulfilled');
    expect(rejectOutcome.status).toBe('rejected');
    expect((rejectOutcome as PromiseRejectedResult).reason).toBeInstanceOf(
      BadRequestException,
    );
    expect(webhookService.dispatch).toHaveBeenCalledTimes(1);

    // Verify resubmitKyc also uses pessimistic_write lock
    sharedApplication.status = KycStatus.RESUBMISSION_REQUIRED;
    await service.resubmitKyc('app-1', 'u1', UserKycTier.STANDARD, {
      governmentIdFront: makeFile('governmentIdFront', 'front2.jpg'),
      selfie: makeFile('selfie', 'selfie2.jpg'),
    });

    const kycFindOneCalls = findOneCalls.filter(
      (c) => c.entity === KYCApplication,
    );
    expect(kycFindOneCalls).toHaveLength(3);
    for (const call of kycFindOneCalls) {
      expect(call.options.lock).toEqual({ mode: 'pessimistic_write' });
    }
  });
});

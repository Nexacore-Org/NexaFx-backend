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

describe('KycService — Orphaned Document Cleanup (#1500)', () => {
  let service: KycService;
  let kycRepository: jest.Mocked<Partial<Repository<KYCApplication>>>;
  let userRepository: jest.Mocked<Partial<Repository<User>>>;
  let managerMock: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: Partial<DataSource>;
  let storageService: jest.Mocked<StorageService>;

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

    kycRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => dto as KYCApplication),
      save: jest.fn(async (entity) => entity as KYCApplication),
    };

    userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'u1',
        kycTier: UserKycTier.BASIC,
      } as User),
    };

    managerMock = {
      findOne: jest.fn(),
      save: jest.fn(async (...args: unknown[]) => args[args.length - 1]),
    };

    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(managerMock)),
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

    service = new KycService(
      kycRepository as Repository<KYCApplication>,
      userRepository as Repository<User>,
      dataSource as DataSource,
      { sendToTokens: jest.fn() } as unknown as FirebaseService,
      {} as NotificationsService,
      { dispatch: jest.fn() } as unknown as WebhookService,
      storageService,
      { append: jest.fn() } as unknown as UnifiedActivityFeedService,
    );
  });

  it('deletes the first uploaded key when the second upload in applyForKyc throws', async () => {
    storageService.upload
      .mockResolvedValueOnce('kyc/u1/front-1.jpg')
      .mockRejectedValueOnce(new Error('S3 upload failure on second file'));

    await expect(
      service.applyForKyc('u1', UserKycTier.STANDARD, {
        governmentIdFront: makeFile('governmentIdFront', 'front-1.jpg'),
        selfie: makeFile('selfie', 'selfie-1.jpg'),
      }),
    ).rejects.toThrow('S3 upload failure on second file');

    expect(storageService.delete).toHaveBeenCalledTimes(1);
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/front-1.jpg');
    expect(kycRepository.save).not.toHaveBeenCalled();
  });

  it('deletes all uploaded keys when kycRepository.save fails in applyForKyc', async () => {
    kycRepository.save!.mockRejectedValueOnce(new Error('DB write failed'));

    await expect(
      service.applyForKyc('u1', UserKycTier.STANDARD, {
        governmentIdFront: makeFile('governmentIdFront', 'front.jpg'),
        governmentIdBack: makeFile('governmentIdBack', 'back.jpg'),
        selfie: makeFile('selfie', 'selfie.jpg'),
      }),
    ).rejects.toThrow('DB write failed');

    expect(storageService.delete).toHaveBeenCalledTimes(3);
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/front.jpg');
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/back.jpg');
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/selfie.jpg');
  });

  it('deletes replaced document keys via StorageService.delete after resubmitKyc commits', async () => {
    const callOrder: string[] = [];
    const existingKyc: Partial<KYCApplication> = {
      id: 'app-1',
      userId: 'u1',
      status: KycStatus.RESUBMISSION_REQUIRED,
      targetTier: UserKycTier.STANDARD,
      documents: {
        governmentIdFront: {
          s3Key: 'kyc/u1/old-front.jpg',
          mimeType: 'image/jpeg',
        },
        governmentIdBack: {
          s3Key: 'kyc/u1/kept-back.jpg',
          mimeType: 'image/jpeg',
        },
        selfie: {
          s3Key: 'kyc/u1/old-selfie.jpg',
          mimeType: 'image/jpeg',
        },
      },
    };

    managerMock.findOne
      .mockResolvedValueOnce(existingKyc)
      .mockResolvedValueOnce({ id: 'u1', kycTier: UserKycTier.BASIC });
    managerMock.save.mockImplementationOnce(async (entity) => {
      callOrder.push('db-save');
      return entity;
    });
    storageService.delete.mockImplementation(async (key: string) => {
      callOrder.push(`delete:${key}`);
    });

    const result = await service.resubmitKyc(
      'app-1',
      'u1',
      UserKycTier.STANDARD,
      {
        governmentIdFront: makeFile('governmentIdFront', 'new-front.jpg'),
        selfie: makeFile('selfie', 'new-selfie.jpg'),
      },
    );

    expect(result.status).toBe(KycStatus.PENDING);
    expect(existingKyc.documents).toEqual({
      governmentIdFront: {
        s3Key: 'kyc/u1/new-front.jpg',
        mimeType: 'image/jpeg',
      },
      governmentIdBack: {
        s3Key: 'kyc/u1/kept-back.jpg',
        mimeType: 'image/jpeg',
      },
      selfie: {
        s3Key: 'kyc/u1/new-selfie.jpg',
        mimeType: 'image/jpeg',
      },
    });
    expect(storageService.delete).toHaveBeenCalledTimes(2);
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/old-front.jpg');
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/old-selfie.jpg');
    expect(storageService.delete).not.toHaveBeenCalledWith(
      'kyc/u1/kept-back.jpg',
    );
    expect(callOrder[0]).toBe('db-save');
  });

  it('deletes newly uploaded keys and preserves old keys when resubmitKyc fails before commit', async () => {
    const existingKyc: Partial<KYCApplication> = {
      id: 'app-1',
      userId: 'u1',
      status: KycStatus.RESUBMISSION_REQUIRED,
      targetTier: UserKycTier.STANDARD,
      documents: {
        governmentIdFront: {
          s3Key: 'kyc/u1/old-front.jpg',
          mimeType: 'image/jpeg',
        },
        selfie: {
          s3Key: 'kyc/u1/old-selfie.jpg',
          mimeType: 'image/jpeg',
        },
      },
    };

    managerMock.findOne
      .mockResolvedValueOnce(existingKyc)
      .mockResolvedValueOnce({ id: 'u1', kycTier: UserKycTier.BASIC });
    managerMock.save.mockRejectedValueOnce(new Error('Transaction aborted'));

    await expect(
      service.resubmitKyc('app-1', 'u1', UserKycTier.STANDARD, {
        governmentIdFront: makeFile('governmentIdFront', 'new-front.jpg'),
        selfie: makeFile('selfie', 'new-selfie.jpg'),
      }),
    ).rejects.toThrow('Transaction aborted');

    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/new-front.jpg');
    expect(storageService.delete).toHaveBeenCalledWith('kyc/u1/new-selfie.jpg');
    expect(storageService.delete).not.toHaveBeenCalledWith(
      'kyc/u1/old-front.jpg',
    );
    expect(storageService.delete).not.toHaveBeenCalledWith(
      'kyc/u1/old-selfie.jpg',
    );
  });
});

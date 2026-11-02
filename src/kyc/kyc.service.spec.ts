import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { KycService } from './kyc.service';
import { KYCApplication, KycStatus } from './entities/kyc-application.entity';
import { User, UserKycTier } from '../users/user.entity';
import { ScreeningStatus } from '../sanctions/entities/kyc-screening.entity';

describe('KycService — approveKyc sanctions enforcement (#1493)', () => {
  let service: KycService;
  let kycRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let sanctionsService: {
    screenUser: jest.Mock;
    getLatestScreening: jest.Mock;
  };
  let transactionOpen: boolean;

  const makePendingKyc = (): KYCApplication =>
    ({
      id: 'kyc-1',
      userId: 'user-1',
      status: KycStatus.PENDING,
      targetTier: UserKycTier.STANDARD,
      documents: {},
    }) as unknown as KYCApplication;

  const makeUser = (): User =>
    ({
      id: 'user-1',
      email: 'applicant@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      kycTier: UserKycTier.BASIC,
      fcmTokens: [],
    }) as unknown as User;

  beforeEach(() => {
    transactionOpen = false;
    const kycRecord = makePendingKyc();
    const userRecord = makeUser();

    kycRepository = {
      findOne: jest.fn().mockImplementation(async () => ({ ...kycRecord })),
    };
    userRepository = {
      findOne: jest.fn().mockImplementation(async () => ({ ...userRecord })),
    };

    manager = {
      findOne: jest.fn().mockImplementation(async (entity) => {
        if (entity === KYCApplication) return { ...kycRecord };
        if (entity === User) return { ...userRecord };
        return null;
      }),
      save: jest.fn().mockImplementation(async (entity) => entity),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        transactionOpen = true;
        try {
          return await cb(manager);
        } finally {
          transactionOpen = false;
        }
      }),
    };

    sanctionsService = {
      getLatestScreening: jest.fn().mockResolvedValue(null),
      screenUser: jest.fn().mockImplementation(async () => {
        if (transactionOpen) {
          throw new Error(
            'screenUser must not be called while a DB transaction is open',
          );
        }
        return { id: 'scr-1', status: ScreeningStatus.CLEAR };
      }),
    };

    service = new KycService(
      kycRepository as any,
      userRepository as any,
      dataSource as any,
      { sendToTokens: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as any,
      { upload: jest.fn(), getSignedUrl: jest.fn() } as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any,
      sanctionsService as any,
    );
  });

  it('approves KYC and persists tier upgrade when screening status is CLEAR (outside the DB transaction)', async () => {
    await service.approveKyc('kyc-1', 'admin-1');

    expect(sanctionsService.screenUser).toHaveBeenCalledWith('user-1');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'kyc-1',
        status: KycStatus.APPROVED,
        reviewedBy: 'admin-1',
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        kycTier: UserKycTier.STANDARD,
      }),
    );
  });

  it('approves KYC when the latest screening was overridden to CLEAR by an admin', async () => {
    sanctionsService.getLatestScreening.mockResolvedValue({
      id: 'scr-override',
      status: ScreeningStatus.CLEAR,
      overriddenBy: 'super-admin-1',
      overrideReason: 'Verified false positive',
    });

    await service.approveKyc('kyc-1', 'admin-1');

    expect(sanctionsService.screenUser).not.toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        kycTier: UserKycTier.STANDARD,
      }),
    );
  });

  it('rejects approval with 409 ConflictException when screening status is WARNING and persists no tier change', async () => {
    sanctionsService.screenUser.mockResolvedValue({
      id: 'scr-warn',
      status: ScreeningStatus.WARNING,
    });

    await expect(service.approveKyc('kyc-1', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects approval when screening status is ERROR and persists no tier change', async () => {
    sanctionsService.screenUser.mockResolvedValue({
      id: 'scr-err',
      status: ScreeningStatus.ERROR,
    });

    await expect(service.approveKyc('kyc-1', 'admin-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects approval with 409 ConflictException when screening status is BLOCKED and persists no tier change', async () => {
    sanctionsService.screenUser.mockResolvedValue({
      id: 'scr-block',
      status: ScreeningStatus.BLOCKED,
    });

    await expect(service.approveKyc('kyc-1', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('fails closed when SanctionsService is absent and persists no tier change', async () => {
    const serviceWithoutSanctions = new KycService(
      kycRepository as any,
      userRepository as any,
      dataSource as any,
      { sendToTokens: jest.fn() } as any,
      {} as any,
      { dispatch: jest.fn() } as any,
      { upload: jest.fn(), getSignedUrl: jest.fn() } as any,
      { append: jest.fn() } as any,
      undefined as any,
    );

    await expect(
      serviceWithoutSanctions.approveKyc('kyc-1', 'admin-1'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
  });
});

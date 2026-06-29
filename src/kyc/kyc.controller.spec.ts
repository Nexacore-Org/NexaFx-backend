import { KycController, ApplyKycDto } from './kyc.controller';
import { KycService } from './kyc.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Readable } from 'stream';
import { UserKycTier } from '../users/user.entity';

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: Partial<KycService>;
  let applySpy: jest.Mock;
  let getKycStatusSpy: jest.Mock;

  const buildMulterFile = (
    fieldname: string,
    originalname: string,
    mimetype: string,
    buffer: Buffer = Buffer.from([0xff, 0xd8, 0xff]),
  ): Express.Multer.File => ({
    fieldname,
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    destination: '',
    filename: originalname,
    path: '',
    buffer,
    stream: new Readable(),
  });

  beforeEach(() => {
    applySpy = jest.fn().mockResolvedValue({ message: 'ok', status: 'pending' });
    getKycStatusSpy = jest.fn().mockResolvedValue({
      currentTier: UserKycTier.BASIC,
      application: null,
      nextTier: UserKycTier.STANDARD,
      requiredDocuments: ['governmentIdFront', 'governmentIdBack', 'selfie'],
    });
    serviceMock = { applyForKyc: applySpy, getKycStatus: getKycStatusSpy };
    controller = new KycController(serviceMock as KycService);
  });

  it('should call service with extracted file objects when files are provided', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const files = {
      governmentIdFront: [buildMulterFile('governmentIdFront', 'front.jpg', 'image/jpeg')],
      selfie: [buildMulterFile('selfie', 'selfie.jpg', 'image/jpeg')],
    };

    const dto: ApplyKycDto = {
      targetTier: UserKycTier.STANDARD,
    };

    await controller.applyKyc(user, files, dto);

    expect(applySpy).toHaveBeenCalledTimes(1);
    const [calledUserId, calledTier, calledFiles] = applySpy.mock.calls[0] as [
      string,
      UserKycTier.STANDARD | UserKycTier.ENHANCED,
      { governmentIdFront: Express.Multer.File; selfie: Express.Multer.File },
    ];
    expect(calledUserId).toBe('user-123');
    expect(calledTier).toBe(UserKycTier.STANDARD);
    expect(calledFiles.governmentIdFront).toBeDefined();
    expect(calledFiles.selfie).toBeDefined();
  });

  it('should call getKycStatus and return tier info', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const result = await controller.getKycStatus(user);

    expect(getKycStatusSpy).toHaveBeenCalledWith('user-123');
    expect(result.currentTier).toBe(UserKycTier.BASIC);
    expect(result.nextTier).toBe(UserKycTier.STANDARD);
    expect(result.requiredDocuments).toEqual(['governmentIdFront', 'governmentIdBack', 'selfie']);
  });
});
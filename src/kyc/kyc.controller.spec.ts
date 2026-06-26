import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { ResubmitKycDto } from './dtos/kyc-resubmit';
import { DocumentType } from './entities/kyc.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Readable } from 'stream';

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: Partial<KycService>;
  let submitSpy: jest.Mock;

  const buildMulterFile = (
    fieldname: string,
    originalname: string,
    mimetype: string,
  ): Express.Multer.File => ({
    fieldname,
    originalname,
    encoding: '7bit',
    mimetype,
    size: 1024,
    destination: '',
    filename: originalname,
    path: '',
    buffer: Buffer.from([0xff, 0xd8, 0xff]), // JPEG magic bytes
    stream: new Readable(),
  });

  beforeEach(() => {
    submitSpy = jest.fn().mockResolvedValue({ message: 'ok', status: 'pending', tier: 0 });
    serviceMock = { submitKyc: submitSpy };
    controller = new KycController(serviceMock as KycService);
  });

  it('should call service with extracted file objects when files are provided', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const files = {
      documentFront: [buildMulterFile('documentFront', 'front.jpg', 'image/jpeg')],
      selfie: [buildMulterFile('selfie', 'selfie.jpg', 'image/jpeg')],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await controller.submitKyc(user, files, dto);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const [calledUserId, calledDto, calledFiles] = submitSpy.mock.calls[0] as [
      string,
      SubmitKycDto,
      { documentFront: Express.Multer.File; selfie: Express.Multer.File },
    ];
    expect(calledUserId).toBe('user-123');
    expect(calledFiles.documentFront).toBeDefined();
    expect(calledFiles.selfie).toBeDefined();
    expect(calledDto.fullName).toBe('Test User');
  });

  it('should throw BadRequestException when documentFront is missing', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await expect(controller.submitKyc(user, {}, dto)).rejects.toThrow(
      'documentFront file is required',
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when selfie is missing', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };

    const files = {
      documentFront: [buildMulterFile('documentFront', 'front.jpg', 'image/jpeg')],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'NG',
    };

    await expect(controller.submitKyc(user, files, dto)).rejects.toThrow(
      'selfie file is required',
    );
  });

  it('should call resubmitKyc when resubmission is submitted with files', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-456',
      email: 'test@example.com',
      role: 'user',
    };

    const filesForController: {
      documentFront?: Express.Multer.File[];
      documentBack?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    } = {
      documentFront: [
        {
          fieldname: 'documentFront',
          originalname: 'front.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1024,
          destination: '',
          filename: 'new-front.jpg',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
      selfie: [
        {
          fieldname: 'selfie',
          originalname: 'selfie.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 2048,
          destination: '',
          filename: 'new-selfie.png',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
    };

    const dto: ResubmitKycDto = {
      fullName: 'Test User Updated',
      documentType: DocumentType.NATIONAL_ID,
      documentNumber: 'XYZ789',
      dateOfBirth: new Date().toISOString(),
      nationality: 'Y',
    };

    const reqForController = {
      kycUploadVersion: 'v2',
    } as unknown as Request;
    await controller.resubmitKyc(
      user,
      filesForController,
      dto,
      reqForController,
    );

    expect(resubmitSpy).toHaveBeenCalledTimes(1);
    const calledArgs = resubmitSpy.mock.calls as [
      string,
      { documentFrontUrl?: string; selfieUrl?: string },
    ][];
    const payload = calledArgs[0][1];
    expect(payload.documentFrontUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-456/v2',
    );
    expect(payload.selfieUrl!.replace(/\\/g, '/')).toContain(
      'uploads/kyc/user-456/v2',
    );
  });

  it('should return KYC status for authenticated user', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-789',
      email: 'test@example.com',
      role: 'user',
    };

    const result = await controller.getKycStatus(user);
    expect(result).toEqual({ status: 'not_submitted' });
  });
});

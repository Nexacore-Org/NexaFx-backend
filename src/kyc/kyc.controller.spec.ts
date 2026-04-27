import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dtos/kyc-submit';
import { DocumentType } from './entities/kyc.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type { Request } from 'express';
import { Readable } from 'stream';

// lightweight test helper types removed; controller call uses properly-typed multer file objects

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: KycService;
  let submitSpy: jest.Mock<Promise<any>, [string, Record<string, unknown>]>;

  beforeEach(() => {
    // create a mocked service object that satisfies the KycService shape
    submitSpy = jest
      .fn<Promise<any>, [string, Record<string, unknown>]>()
      .mockResolvedValue({ message: 'ok' });
    serviceMock = { submitKyc: submitSpy } as unknown as KycService;

    controller = new KycController(serviceMock);
  });

  it('should call service with documentFrontUrl and selfieUrl when files provided', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    };
    // (helper) lightweight representation of filenames — not used directly in controller call

    // build objects that satisfy Express.Multer.File[] so we can call the controller
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
          filename: 'front.jpg',
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
          filename: 'selfie.png',
          path: '',
          buffer: Buffer.from([]),
          stream: new Readable(),
        },
      ],
    };

    const dto: SubmitKycDto = {
      fullName: 'Test User',
      documentType: DocumentType.PASSPORT,
      documentNumber: 'ABC123',
      dateOfBirth: new Date().toISOString(),
      nationality: 'X',
    } as SubmitKycDto;

    // call method providing properly typed multer file objects and a typed Request stub
    const reqForController = { kycUploadVersion: 'v1' } as unknown as Request;
    await controller.submitKyc(user, filesForController, dto, reqForController);

    // verify the underlying spy was called with expected payload
    expect(submitSpy).toHaveBeenCalledTimes(1);
    // inspect the call arguments in a typed-safe manner
    const calledArgs = submitSpy.mock.calls as [
      string,
      { documentFrontUrl?: string; selfieUrl?: string },
    ][];
    const payload = calledArgs[0][1];
    expect(payload.documentFrontUrl.replace(/\\/g, '/')).toContain('uploads/kyc/user-123/v1');
    expect(payload.selfieUrl.replace(/\\/g, '/')).toContain('uploads/kyc/user-123/v1');
  });
});

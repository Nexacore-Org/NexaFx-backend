import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

describe('S3StorageService', () => {
  const originalEnv = { ...process.env };
  let send: jest.SpyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.S3_BUCKET_NAME = 'test-bucket';
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('uses the allow-listed extension and ContentType, not client file metadata', async () => {
    const service = new S3StorageService();
    const file = {
      buffer: Buffer.from('file'),
      mimetype: 'image/png',
      originalname: 'payload.html',
    } as Express.Multer.File;

    await service.upload(file, 'kyc/user-id');

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input.Key).toMatch(/^test\/kyc\/user-id\/[0-9a-f-]+\.png$/);
    expect(command.input.ContentType).toBe('image/png');
  });
});

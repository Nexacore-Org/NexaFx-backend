import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  const originalEnv = { ...process.env };
  let service: LocalStorageService;
  let mkdir: jest.SpyInstance;
  let writeFile: jest.SpyInstance;
  let unlink: jest.SpyInstance;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.STORAGE_SIGNING_SECRET = 'test-storage-signing-secret';
    service = new LocalStorageService();
    mkdir = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    writeFile = jest
      .spyOn(fs.promises, 'writeFile')
      .mockResolvedValue(undefined);
    unlink = jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  const makeFile = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      buffer: Buffer.from('file'),
      mimetype: 'image/jpeg',
      originalname: 'payload.html',
      ...overrides,
    }) as Express.Multer.File;

  it('uses the allow-listed MIME extension instead of the original filename', async () => {
    const key = await service.upload(makeFile(), 'kyc/user-id');

    expect(key).toMatch(/^test\/kyc\/user-id\/[0-9a-f-]+\.jpg$/);
    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining('/uploads/test/kyc/user-id'),
      { recursive: true },
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.jpg$/),
      Buffer.from('file'),
    );
  });

  it('rejects MIME types outside the server allow-list', async () => {
    await expect(
      service.upload(makeFile({ mimetype: 'text/html' }), 'kyc/user-id'),
    ).rejects.toThrow(BadRequestException);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('rejects paths outside the uploads directory', async () => {
    await expect(
      service.upload(makeFile(), '../../../uploads-evil'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.getSignedUrl('../uploads-evil/file.jpg', 60),
    ).rejects.toThrow(BadRequestException);
    await expect(service.delete('../uploads-evil/file.jpg')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('treats a missing file during deletion as an already-completed delete', async () => {
    unlink.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(
      service.delete('test/kyc/missing.jpg'),
    ).resolves.toBeUndefined();
  });
});

import {
  BadRequestException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { LocalStorageSignatureMiddleware } from './local-storage-signature.middleware';
import { StorageModule } from './storage.module';
import {
  STORAGE_SERVICE_TOKEN,
  getStorageSigningSecret,
} from './storage.service';

// Minimal valid JPEG header (SOI + APP0 JFIF) recognized by file-type fromBuffer
const JPEG_MAGIC_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

describe('Storage security & reliability (#1503)', () => {
  const originalEnv = { ...process.env };
  let localService: LocalStorageService;
  let middleware: LocalStorageSignatureMiddleware;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      STORAGE_SIGNING_SECRET: 'dedicated-storage-signing-secret-32b',
      JWT_SECRET: 'separate-jwt-secret-never-used-for-storage',
    };
    localService = new LocalStorageService();
    middleware = new LocalStorageSignatureMiddleware();

    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('MIME validation and extension derivation', () => {
    it('Uploading image/jpeg content named evil.html stores a .jpg key', async () => {
      const file = {
        buffer: JPEG_MAGIC_BUFFER,
        originalname: 'evil.html',
        mimetype: 'text/html',
        size: JPEG_MAGIC_BUFFER.length,
      } as Express.Multer.File;

      const key = await localService.upload(file, 'kyc/user-123');

      expect(key).toMatch(/^test\/kyc\/user-123\/[0-9a-f-]+\.jpg$/);
      expect(key.endsWith('.html')).toBe(false);
      expect(fs.promises.mkdir).toHaveBeenCalledTimes(1);
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
    });

    it('rejects HTML/SVG payload even when client claims image/jpeg', async () => {
      const file = {
        buffer: Buffer.from('<html><script>alert(1)</script></html>'),
        originalname: 'evil.html',
        mimetype: 'image/jpeg',
        size: 39,
      } as Express.Multer.File;

      await expect(localService.upload(file, 'kyc/user-123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('S3StorageService stores server-validated extension and ContentType instead of client values', async () => {
      const s3Service = new S3StorageService();
      const sendSpy = jest
        .spyOn((s3Service as any).s3Client, 'send')
        .mockResolvedValue({});

      const file = {
        buffer: JPEG_MAGIC_BUFFER,
        originalname: 'xss.svg',
        mimetype: 'image/svg+xml',
        size: JPEG_MAGIC_BUFFER.length,
      } as Express.Multer.File;

      const key = await s3Service.upload(file, 'kyc/user-456');

      expect(key).toMatch(/^test\/kyc\/user-456\/[0-9a-f-]+\.jpg$/);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const putCommand = sendSpy.mock.calls[0][0] as {
        input: { Key: string; ContentType: string };
      };
      expect(putCommand.input.Key).toBe(key);
      expect(putCommand.input.ContentType).toBe('image/jpeg');
    });
  });

  describe('Path containment checks', () => {
    it('rejects path traversal attempts and sibling-prefix escapes on upload and delete', async () => {
      const file = {
        buffer: JPEG_MAGIC_BUFFER,
        originalname: 'doc.jpg',
        mimetype: 'image/jpeg',
        size: JPEG_MAGIC_BUFFER.length,
      } as Express.Multer.File;

      await expect(localService.upload(file, '../../../etc')).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        localService.upload(file, '../../uploads-evil'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        localService.delete('../../uploads-evil/secret.jpg'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Dedicated STORAGE_SIGNING_SECRET and signature middleware', () => {
    it('fails at boot when STORAGE_SIGNING_SECRET is missing outside development', async () => {
      delete process.env.STORAGE_SIGNING_SECRET;
      process.env.NODE_ENV = 'production';

      expect(() => getStorageSigningSecret()).toThrow(
        /STORAGE_SIGNING_SECRET must be set outside development/i,
      );

      await expect(
        Test.createTestingModule({
          imports: [StorageModule],
        }).compile(),
      ).rejects.toThrow(
        /STORAGE_SIGNING_SECRET must be set outside development/i,
      );
    });

    it('boots StorageModule when STORAGE_SIGNING_SECRET is configured', async () => {
      process.env.NODE_ENV = 'production';
      process.env.STORAGE_SIGNING_SECRET = 'prod-storage-signing-secret';

      const moduleRef = await Test.createTestingModule({
        imports: [StorageModule],
      }).compile();

      expect(moduleRef.get(STORAGE_SERVICE_TOKEN)).toBeInstanceOf(
        LocalStorageService,
      );
    });

    it('rejects a URL signed with "local-secret" or JWT_SECRET when STORAGE_SIGNING_SECRET is set', () => {
      const key = 'test/kyc/user-123/doc.jpg';
      const expires = String(Math.floor(Date.now() / 1000) + 300);

      const forgedWithFallback = crypto
        .createHmac('sha256', 'local-secret')
        .update(`${key}:${expires}`)
        .digest('hex');

      const forgedWithJwtSecret = crypto
        .createHmac('sha256', process.env.JWT_SECRET!)
        .update(`${key}:${expires}`)
        .digest('hex');

      const makeReq = (signature: string) =>
        ({
          path: `/uploads/${key}`,
          query: { expires, signature },
        }) as any;

      const res = { setHeader: jest.fn() } as any;
      const next = jest.fn();

      expect(() =>
        middleware.use(makeReq(forgedWithFallback), res, next),
      ).toThrow(ForbiddenException);
      expect(() =>
        middleware.use(makeReq(forgedWithJwtSecret), res, next),
      ).toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts a valid signature using timingSafeEqual and sets Content-Disposition and X-Content-Type-Options headers', async () => {
      const key = 'test/kyc/user-123/doc.jpg';
      const signedUrl = await localService.getSignedUrl(key, 300);
      const parsed = new URL(signedUrl);

      const timingSafeSpy = jest.spyOn(crypto, 'timingSafeEqual');
      const req = {
        path: parsed.pathname,
        query: {
          expires: parsed.searchParams.get('expires'),
          signature: parsed.searchParams.get('signature'),
        },
      } as any;
      const res = { setHeader: jest.fn() } as any;
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(timingSafeSpy).toHaveBeenCalledTimes(1);
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff',
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects expired signed URLs with GoneException', () => {
      const key = 'test/kyc/user-123/doc.jpg';
      const expires = String(Math.floor(Date.now() / 1000) - 10);
      const signature = crypto
        .createHmac('sha256', process.env.STORAGE_SIGNING_SECRET!)
        .update(`${key}:${expires}`)
        .digest('hex');

      const req = {
        path: `/uploads/${key}`,
        query: { expires, signature },
      } as any;
      const res = { setHeader: jest.fn() } as any;
      const next = jest.fn();

      expect(() => middleware.use(req, res, next)).toThrow(GoneException);
    });
  });

  describe('Non-blocking fs operations', () => {
    it('contains no *Sync fs calls across the storage module', () => {
      const storageDir = __dirname;
      const sourceFiles = [
        'local-storage.service.ts',
        's3-storage.service.ts',
        'local-storage-signature.middleware.ts',
        'storage.module.ts',
        'storage.service.ts',
      ];

      for (const filename of sourceFiles) {
        const content = fs.readFileSync(
          path.join(storageDir, filename),
          'utf8',
        );
        expect(content).not.toMatch(
          /\b(existsSync|mkdirSync|writeFileSync|unlinkSync|readFileSync|statSync|rmSync)\b/,
        );
      }
    });
  });
});

import * as crypto from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { LocalStorageSignatureMiddleware } from './local-storage-signature.middleware';

describe('LocalStorageSignatureMiddleware', () => {
  const originalEnv = { ...process.env };
  let middleware: LocalStorageSignatureMiddleware;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.STORAGE_SIGNING_SECRET = 'test-storage-signing-secret';
    middleware = new LocalStorageSignatureMiddleware();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts a signature made with the dedicated storage secret', () => {
    const key = 'test/kyc/document.jpg';
    const expires = `${Math.floor(Date.now() / 1000) + 60}`;
    const hmac = crypto.createHmac(
      'sha256',
      process.env.STORAGE_SIGNING_SECRET!,
    );
    hmac.update(`${key}:${expires}`);
    const signature = hmac.digest('hex');
    const next = jest.fn();

    middleware.use(
      {
        path: `/uploads/${key}`,
        query: { expires, signature },
      } as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalled();
  });

  it('rejects malformed signatures without comparing unequal-length buffers', () => {
    expect(() =>
      middleware.use(
        {
          path: '/uploads/test/kyc/document.jpg',
          query: {
            expires: `${Math.floor(Date.now() / 1000) + 60}`,
            signature: 'bad',
          },
        } as never,
        {} as never,
        jest.fn(),
      ),
    ).toThrow(ForbiddenException);
  });
});

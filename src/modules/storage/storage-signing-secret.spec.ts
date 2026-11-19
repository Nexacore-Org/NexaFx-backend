import { getStorageSigningSecret } from './storage-signing-secret';

describe('getStorageSigningSecret', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires a dedicated secret outside development', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.STORAGE_SIGNING_SECRET;

    expect(() => getStorageSigningSecret()).toThrow(/STORAGE_SIGNING_SECRET/);
  });

  it('requires a dedicated secret when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    delete process.env.STORAGE_SIGNING_SECRET;

    expect(() => getStorageSigningSecret()).toThrow(/STORAGE_SIGNING_SECRET/);
  });

  it('uses the dedicated storage secret when configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_SIGNING_SECRET = 'dedicated-key';

    expect(getStorageSigningSecret()).toBe('dedicated-key');
  });

  it('generates a non-static local development secret when unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.STORAGE_SIGNING_SECRET;

    expect(getStorageSigningSecret()).toMatch(/^[a-f\d]{64}$/);
  });
});

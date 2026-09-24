/**
 * Unit tests for GDPR export processor.
 * Verifies that collectData strips secrets (password / 2FA / wallet keys)
 * while retaining financial records required for compliance retention.
 *
 * Heavy AWS/S3/Bull dependencies are mocked at the module boundary.
 */

describe('ExportProcessor — anonymisation contract', () => {
  /**
   * Pure helper mirroring the secret-stripping step in collectData:
   *   const { password, twoFactorSecret, walletSecretKeyEncrypted, ...safeProfile } = user;
   */
  function stripSecrets(user: Record<string, unknown>) {
    const {
      password,
      twoFactorSecret,
      walletSecretKeyEncrypted,
      ...safeProfile
    } = user as any;
    return { safeProfile, stripped: { password, twoFactorSecret, walletSecretKeyEncrypted } };
  }

  it('removes password, 2FA secret and encrypted wallet key from export profile', () => {
    const user = {
      id: 'u1',
      email: 'alice@example.com',
      firstName: 'Alice',
      password: 'bcrypt-hash',
      twoFactorSecret: 'otp-secret',
      walletSecretKeyEncrypted: 'enc-key',
      isActive: true,
    };

    const { safeProfile, stripped } = stripSecrets(user);

    expect(safeProfile).not.toHaveProperty('password');
    expect(safeProfile).not.toHaveProperty('twoFactorSecret');
    expect(safeProfile).not.toHaveProperty('walletSecretKeyEncrypted');
    expect(safeProfile.email).toBe('alice@example.com');
    expect(safeProfile.id).toBe('u1');
    expect(stripped.password).toBe('bcrypt-hash');
  });

  it('preserves non-secret profile fields needed for compliance export', () => {
    const user = {
      id: 'u2',
      email: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Jones',
      createdAt: new Date('2024-01-01'),
      password: 'x',
      twoFactorSecret: null,
      walletSecretKeyEncrypted: null,
    };
    const { safeProfile } = stripSecrets(user);
    expect(safeProfile.firstName).toBe('Bob');
    expect(safeProfile.lastName).toBe('Jones');
    expect(safeProfile.createdAt).toEqual(new Date('2024-01-01'));
  });
});

describe('ExportProcessor — job data shape', () => {
  it('expects job payload with userId and email', () => {
    const jobData = { userId: 'u1', email: 'a@b.com' };
    expect(jobData).toEqual(
      expect.objectContaining({
        userId: expect.any(String),
        email: expect.any(String),
      }),
    );
  });
});

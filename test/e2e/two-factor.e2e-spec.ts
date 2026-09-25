import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import { setupTestDatabase, teardownTestDatabase } from '../helpers/db.helper';
import { DataSource } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { TwoFactorAuth } from '../../src/two-factor/entities/two-factor-auth.entity';
import { BackupCode } from '../../src/two-factor/entities/backup-code.entity';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

/**
 * End-to-end coverage for 2FA login enforcement.
 *
 * Exercises the real NestJS module graph (guards, pipes, controllers) and a
 * real test database. Only true external boundaries (Stellar Horizon, mail,
 * etc.) are mocked, via test/helpers/app.helper.ts.
 */
describe('Two-Factor Authentication (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const password = 'Password123!';
  let passwordHash: string;

  const twoFactorSecret = authenticator.generateSecret();
  let backupCodePlain: string;

  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = await setupTestDatabase(app);
    passwordHash = await bcrypt.hash(password, 10);
  });

  afterAll(async () => {
    await teardownTestDatabase(dataSource);
    await app.close();
  });

  beforeEach(async () => {
    // Clean up any fixture data from previous tests to avoid cross-test pollution.
    await dataSource.getRepository(BackupCode).delete({});
    await dataSource.getRepository(TwoFactorAuth).delete({});
    await dataSource.getRepository(User).delete({});

    userEmail = `twofa-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const userRepo = dataSource.getRepository(User);
    const user = userRepo.create({
      email: userEmail,
      password: passwordHash,
      firstName: 'Two',
      lastName: 'Factor',
      isActive: true,
      isEmailVerified: true,
    } as Partial<User>);
    const savedUser = await userRepo.save(user);
    userId = savedUser.id;

    const twoFactorRepo = dataSource.getRepository(TwoFactorAuth);
    const twoFactor = twoFactorRepo.create({
      userId,
      secret: twoFactorSecret,
      isEnabled: true,
    } as Partial<TwoFactorAuth>);
    await twoFactorRepo.save(twoFactor);

    // Create a single-use backup code for the user.
    backupCodePlain = 'BACKUP-CODE-0001';
    const backupCodeHash = await bcrypt.hash(backupCodePlain, 10);
    const backupCodeRepo = dataSource.getRepository(BackupCode);
    const backupCode = backupCodeRepo.create({
      userId,
      codeHash: backupCodeHash,
      isUsed: false,
    } as Partial<BackupCode>);
    await backupCodeRepo.save(backupCode);
  });

  async function loginWithCredentials(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);

    const body = response.body?.data ?? response.body;
    return body.accessToken ?? body.token ?? body.access_token;
  }

  it('returns a PARTIAL_AUTH token (not a full-access JWT) for a 2FA-enabled user', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: userEmail, password })
      .expect(200);

    const body = response.body?.data ?? response.body;
    const token = body.accessToken ?? body.token ?? body.access_token;

    expect(token).toBeDefined();
    expect(body.requiresTwoFactor ?? body.requires2FA ?? body.partialAuth).toBeTruthy();

    // A PARTIAL_AUTH token must not grant access to unrelated authenticated endpoints.
    await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });

    await request(app.getHttpServer())
      .get('/v1/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => {
        expect([401, 403]).toContain(res.status);
      });
  });

  it('exchanges a valid TOTP code for a full-access JWT', async () => {
    const partialToken = await loginWithCredentials();
    const totpCode = authenticator.generate(twoFactorSecret);

    const response = await request(app.getHttpServer())
      .post('/v1/two-factor/verify')
      .set('Authorization', `Bearer ${partialToken}`)
      .send({ code: totpCode })
      .expect(200);

    const body = response.body?.data ?? response.body;
    const fullToken = body.accessToken ?? body.token ?? body.access_token;
    expect(fullToken).toBeDefined();

    // The full-access JWT should now be accepted by an authenticated endpoint.
    await request(app.getHttpServer())
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${fullToken}`)
      .expect((res) => {
        expect([200, 404]).toContain(res.status);
      });
  });

  it('treats a backup code as single-use', async () => {
    const partialToken = await loginWithCredentials();

    await request(app.getHttpServer())
      .post('/v1/two-factor/verify')
      .set('Authorization', `Bearer ${partialToken}`)
      .send({ code: backupCodePlain })
      .expect(200);

    const secondPartialToken = await loginWithCredentials();

    await request(app.getHttpServer())
      .post('/v1/two-factor/verify')
      .set('Authorization', `Bearer ${secondPartialToken}`)
      .send({ code: backupCodePlain })
      .expect((res) => {
        expect([400, 401, 403]).toContain(res.status);
      });
  });
});

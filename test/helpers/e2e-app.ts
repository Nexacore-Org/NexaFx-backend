import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { seedCurrencies } from '../../src/database/seeds/currency.seed';
import { UsersService } from '../../src/users/users.service';
import { UserRole } from '../../src/users/user.entity';

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
}

export function configureTestEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE ??= 'sqlite';
  process.env.JWT_SECRET ??= 'test-jwt-secret';
  process.env.JWT_EXPIRES_IN ??= '15m';
  process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret';
  process.env.REFRESH_TOKEN_EXPIRES_IN ??= '7d';
  process.env.JWT_TWO_FACTOR_SECRET ??= 'test-2fa-secret';
  process.env.OTP_SECRET ??= 'test-otp-secret';
  process.env.OTP_FIXED_CODE ??= '123456';
  process.env.SKIP_EMAIL_SENDING ??= 'true';
  process.env.WALLET_ENCRYPTION_KEY ??=
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.STELLAR_FAKE_MODE ??= 'true';
  process.env.STELLAR_HORIZON_URL ??= 'https://fake-horizon.invalid';
  process.env.STELLAR_NETWORK ??= 'TESTNET';
  process.env.STELLAR_HOT_WALLET_SECRET ??= 'STELLAR_TEST_SECRET';
  process.env.EXCHANGE_RATES_PROVIDER_FAKE_MODE ??= 'true';
}

export async function createE2eApp(): Promise<{
  app: INestApplication;
  moduleRef: TestingModule;
  dataSource: DataSource;
}> {
  configureTestEnvironment();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.synchronize(true);
  await seedCurrencies(dataSource);

  return { app, moduleRef, dataSource };
}

export function api(app: INestApplication) {
  void app;
  throw new Error(
    'Socket-based test requests are not available in this sandbox. Use service-level helpers instead.',
  );
}

export async function createAdminSession(app: INestApplication): Promise<AuthSession> {
  const usersService = app.get(UsersService);
  const jwtService = app.get(JwtService);

  const existing = await usersService.findByEmail('admin@nexafx.test');
  const admin =
    existing ??
    (await usersService.createUser({
      email: 'admin@nexafx.test',
      password: 'SecureAdminPass123!',
      firstName: 'Admin',
      lastName: 'User',
      walletPublicKey: 'GADMINTESTACCOUNTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      walletSecretKeyEncrypted: 'encrypted-admin-secret',
      referralCode: 'ADMIN123',
      role: UserRole.ADMIN,
    }));

  await usersService.verifyUser(admin.id);
  await usersService.updateRole(admin.id, UserRole.ADMIN);

  return {
    accessToken: jwtService.sign({
      sub: admin.id,
      email: 'admin@nexafx.test',
      role: UserRole.ADMIN,
    }),
  };
}

export async function signupAndVerifyUser(
  app: INestApplication,
  email = `user-${Date.now()}@nexafx.test`,
): Promise<AuthSession & { email: string }> {
  const authService = app.get(AuthService);
  const password = 'SecurePassword123!';
  const otp = process.env.OTP_FIXED_CODE ?? '123456';

  await authService.signup({
    email,
    password,
    firstName: 'Test',
    lastName: 'User',
  });

  const verifyResponse = await authService.verifySignupOtp({
    email,
    otp,
  });

  return {
    email,
    accessToken: verifyResponse.accessToken,
    refreshToken: verifyResponse.refreshToken,
  };
}

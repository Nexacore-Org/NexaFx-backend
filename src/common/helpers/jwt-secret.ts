import type { ConfigService } from '@nestjs/config';

export const JWT_SECRET_MIN_LENGTH = 32;

const DEVELOPMENT_SECRET = 'nexafx-local-development-secret-not-for-deployment-0001';

export function resolveJwtSecret(configService: ConfigService): string {
  const nodeEnv =
    configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '';
  const secret = configService.get<string>('JWT_SECRET');
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';

  if (!secret) {
    if (!isDevOrTest) {
      throw new Error(
        'JWT_SECRET must be set unless NODE_ENV is development or test',
      );
    }
    return DEVELOPMENT_SECRET;
  }

  if (secret.length < JWT_SECRET_MIN_LENGTH && !isDevOrTest) {
    throw new Error(
      `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters long`,
    );
  }

  return secret;
}

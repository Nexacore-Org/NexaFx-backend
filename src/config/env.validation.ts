import { plainToClass } from 'class-transformer';
import { IsString, IsNumber, validateSync, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

class EnvironmentVariables {
  @IsString()
  DB_HOST: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRATION: string;

  @IsString()
  CONTRACT_ADDRESS: string;

  // Mailgun
  @IsString()
  MAILGUN_API_KEY: string;

  @IsString()
  MAILGUN_DOMAIN: string;

  @IsOptional()
  @IsString()
  MAILGUN_API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  MAILGUN_FROM_NAME?: string;

  @IsString()
  MAILGUN_FROM_EMAIL: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  APP_NAME?: string;

  @IsOptional()
  @IsString()
  SKIP_EMAIL_SENDING?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  return validatedConfig;
}

import {
  BadRequestException,
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IsInt } from 'class-validator';
import { configureApp } from './configure-app';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { IdempotencyService } from './common/services/idempotency.service';
import { QueuesDashboardService } from './modules/queues/queues-dashboard.service';

class ConversionDto {
  @IsInt()
  value: number;
}

describe('configureApp', () => {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'ALLOWED_ORIGINS' ? 'http://localhost:3001' : undefined,
    ),
  };
  const queuesDashboard = {
    getRouter: jest.fn().mockReturnValue(() => undefined),
  };
  const app = {
    get: jest.fn((token: unknown) => {
      if (token === ConfigService) return configService;
      if (token === JwtService) return {};
      if (token === QueuesDashboardService) return queuesDashboard;
      if (token === Reflector) return new Reflector();
      if (token === IdempotencyService) return {};
      return undefined;
    }),
    use: jest.fn(),
    useGlobalFilters: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalInterceptors: jest.fn(),
    enableVersioning: jest.fn(),
    enableCors: jest.fn(),
    useStaticAssets: jest.fn(),
  } as unknown as NestExpressApplication;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies the production middleware, filters, interceptors and versioning', () => {
    configureApp(app);

    expect(app.use).toHaveBeenCalled();
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      new AllExceptionsFilter(),
    );
    expect(app.useStaticAssets).toHaveBeenCalled();
    expect(app.enableVersioning).toHaveBeenCalledWith({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    const interceptors = (app.useGlobalInterceptors as jest.Mock).mock.calls[0];
    expect(
      interceptors.some(
        (interceptor: unknown) => interceptor instanceof IdempotencyInterceptor,
      ),
    ).toBe(true);
    expect(
      interceptors.some(
        (interceptor: unknown) =>
          interceptor instanceof ClassSerializerInterceptor,
      ),
    ).toBe(true);

    const cors = (app.enableCors as jest.Mock).mock.calls[0][0];
    expect(cors.allowedHeaders).toContain('X-Request-ID');
    expect(cors.allowedHeaders).toContain('Idempotency-Key');
    expect(cors.exposedHeaders).toContain('X-Idempotency-Replayed');
  });

  it('uses a ValidationPipe without implicit conversion', async () => {
    configureApp(app);

    const pipes = (app.useGlobalPipes as jest.Mock).mock.calls[0];
    expect(pipes).toHaveLength(1);
    expect(pipes[0]).toBeInstanceOf(ValidationPipe);

    await expect(
      (pipes[0] as ValidationPipe).transform({ value: '1' }, {
        type: 'body',
        metatype: ConversionDto,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

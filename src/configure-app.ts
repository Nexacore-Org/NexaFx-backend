import { Reflector } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  ValidationPipe,
  ValidationPipeOptions,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import helmet from 'helmet';
import * as compression from 'compression';
import { join } from 'path';
import { Request, Response, NextFunction } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { IdempotencyService } from './common/services/idempotency.service';
import { createAdminQueueAuthMiddleware } from './modules/queues/admin-queue-auth.middleware';
import { QueuesDashboardService } from './modules/queues/queues-dashboard.service';
import { runWithRequestId } from './common/context/request-context';
import { sanitizeRequestId } from './common/utils/request-id.util';

export function configureApp(
  app: NestExpressApplication,
  validationPipeOptions?: ValidationPipeOptions,
): void {
  const configService = app.get(ConfigService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = sanitizeRequestId(req.headers['x-request-id']);
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    runWithRequestId(requestId, () => next());
  });

  app.use(helmet());
  app.use(compression({ threshold: 1024 }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      ...validationPipeOptions,
    }),
  );

  const idempotencyService = app.get(IdempotencyService);

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
    new IdempotencyInterceptor(idempotencyService),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.use(
    '/admin/queues',
    createAdminQueueAuthMiddleware(app.get(JwtService), configService),
    app.get(QueuesDashboardService).getRouter(),
  );

  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS') ?? '';
  const origins = allowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Idempotency-Replayed'],
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
}

import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
  ValidationPipeOptions,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as compression from 'compression';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from '../common/interceptors/transform-response.interceptor';
import { runWithRequestId } from '../common/context/request-context';
import { IdempotencyService } from '../common/services/idempotency.service';
import { sanitizeRequestId } from '../common/utils/request-id.util';

export function configureApp(
  app: INestApplication,
  validationPipeOptions?: ValidationPipeOptions,
): void {
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

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
    new IdempotencyInterceptor(app.get(IdempotencyService)),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
}

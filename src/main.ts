import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { IdempotencyService } from './common/services/idempotency.service';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Security headers
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Do not expose the validated object or its values in error responses —
      // prevents leaking sensitive fields (passwords, tokens) back to the client.
      validationError: { target: false, value: false },
    }),
  );

  // Get service instance for global interceptor
  const idempotencyService = app.get(IdempotencyService);

  // Global Filters (order matters: specific before general)
  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
    new IdempotencyInterceptor(idempotencyService),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NexaFX API')
    .setDescription('NexaFX Backend API with Audit Logs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDoc);

  // CORS
  app.enableCors({
    // origin:
    //   configService.get<string>('FRONTEND_URL') || 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Note: do NOT expose uploads via a global static asset mount. KYC files
  // must remain restricted to admin-only access. Serve files via the
  // admin controller which is protected by guards.

  // Register Multer-specific exception filter before other global filters so
  // upload errors (like LIMIT_FILE_SIZE) are converted into 400 responses.
  app.useGlobalFilters(
    new MulterExceptionFilter(),
    new HttpExceptionFilter(),
    new AllExceptionsFilter(),
  );
  await app.listen(process.env.PORT ?? 3001);
}

// Handle startup errors explicitly so linters don't complain about an
// unhandled/ignored promise (no-floating-promises). Log the error and exit
// with a non-zero code so process managers notice failures.
void bootstrap();

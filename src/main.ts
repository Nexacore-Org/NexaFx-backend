import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Reflector } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MulterExceptionFilter } from './common/filters/multer-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import helmet from 'helmet';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {createAdminQueueAuthMiddleware} from './modules/queues/admin-queue-auth.middleware';
import { QueuesDashboardService } from './modules/queues/queues-dashboard.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { join } from 'path';
import * as compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  app.use(helmet());

  // Response compression
  app.use(compression({ threshold: 1024 }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );

  // Global Filters (order matters: specific before general)
  //   app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

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

  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS') ?? '';
  const origins = allowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);


  const jwtService = app.get(JwtService);
  const configService = app.get(ConfigService);
  const queuesDashboard = app.get(QueuesDashboardService);

  app.use(
    '/admin/queues',
    createAdminQueueAuthMiddleware(jwtService, configService),
    queuesDashboard.getRouter(),
  );

  // CORS
  app.enableCors({
    origin: origins.length ? origins : false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = configService.get<number>('PORT') ?? 3000;
  const environment = configService.get<string>('NODE_ENV');

  // Configure NestJS static file middleware to serve uploads
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  await app.listen(port);

  logger.log(`NexaFX API v2 started on port ${port}`);
  logger.log(`Environment: ${environment}`);
  logger.log(
    `CORS origins: ${origins.length ? origins.join(', ') : 'none configured'}`,
  );
}

void bootstrap();

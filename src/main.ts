import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { createAdminQueueAuthMiddleware } from './modules/queues/admin-queue-auth.middleware';
import { QueuesDashboardService } from './modules/queues/queues-dashboard.service';
import { join } from 'path';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  configureApp(app);

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
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Idempotency-Replayed'],
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

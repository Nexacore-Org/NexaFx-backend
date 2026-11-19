import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  configureApp(app);

  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT') ?? 3000;
  const environment = configService.get<string>('NODE_ENV');

  await app.listen(port);

  logger.log(`NexaFX API v2 started on port ${port}`);
  logger.log(`Environment: ${environment}`);
}

void bootstrap();

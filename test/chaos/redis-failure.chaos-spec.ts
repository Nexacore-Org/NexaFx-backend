import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from '../../src/common/interceptors/transform-response.interceptor';
import { ExchangeRatesCache } from '../../src/exchange-rates/cache/exchange-rates.cache';
import { configureTestEnvironment } from '../helpers/e2e-app';
import { DataSource } from 'typeorm';
import { seedCurrencies } from '../../src/database/seeds/currency.seed';

describe('Cache Failure Chaos Test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    configureTestEnvironment();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ExchangeRatesCache)
      .useValue({
        get: () => {
          throw new Error('cache backend unavailable');
        },
        set: () => {
          throw new Error('cache backend unavailable');
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('continues serving FX requests when the cache layer is unavailable', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/exchange-rates')
      .query({ from: 'EUR', to: 'USD' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.rate).toBeGreaterThan(0);
  });
});

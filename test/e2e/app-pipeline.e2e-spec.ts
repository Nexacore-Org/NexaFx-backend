import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Router } from 'express';
import * as request from 'supertest';
import { configureApp } from '../../src/configure-app';
import {
  IdempotencyRedisCache,
  IdempotencyService,
} from '../../src/common/services/idempotency.service';
import { QueuesDashboardService } from '../../src/modules/queues/queues-dashboard.service';

@Controller('pipeline-test')
class PipelineTestController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Post('echo')
  echo() {
    return { ok: true };
  }
}

describe('Shared app pipeline (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [PipelineTestController],
      providers: [
        IdempotencyRedisCache,
        IdempotencyService,
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
        {
          provide: QueuesDashboardService,
          useValue: { getRouter: () => Router() },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    app.use((req, _res, next) => {
      req.user = { userId: 'pipeline-test-user' };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('echoes X-Request-ID on HTTP responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/pipeline-test/ping')
      .set('X-Request-ID', 'trace-123');

    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it('sets helmet security headers on HTTP responses', async () => {
    const response = await request(app.getHttpServer()).get(
      '/v1/pipeline-test/ping',
    );

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('replays a cached response for a repeated Idempotency-Key', async () => {
    const server = app.getHttpServer();
    const send = () =>
      request(server)
        .post('/v1/pipeline-test/echo')
        .set('Idempotency-Key', 'pipeline-replay-key')
        .send({ amount: 10 });

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.headers['x-idempotency-replayed']).toBe('true');
    expect(second.body.data).toEqual(first.body.data);
  });
});

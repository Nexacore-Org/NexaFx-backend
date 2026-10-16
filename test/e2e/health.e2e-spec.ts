import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { HealthController } from '../../src/health/health.controller';
import { HealthService } from '../../src/health/health.service';

describe('Health readiness (e2e)', () => {
  let app: INestApplication;
  let dataSource: { query: jest.Mock };

  beforeAll(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ '1': 1 }]) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready returns 200 when the DataSource query succeeds', async () => {
    dataSource.query.mockResolvedValueOnce([{ '1': 1 }]);

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
  });

  it('GET /health/ready returns 503 when the DataSource query fails', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(res.body.status).toBe('error');
  });
});

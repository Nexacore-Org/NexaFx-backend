
import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Fees (public)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('GET /api/v1/fees should be public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/fees')
      .expect(200);
  });

  afterAll(async () => app.close());
});

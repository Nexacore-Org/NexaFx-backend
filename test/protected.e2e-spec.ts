import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('Protected endpoints', () => {
  it('should return 401 without bearer', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/profile')
      .expect(401);
  });

  it('should return 200 with valid token', async () => {
    const token = 'Bearer VALID_JWT'; // generate via helper
    await request(app.getHttpServer())
      .get('/api/v1/profile')
      .set('Authorization', token)
      .expect(200);
  });
});
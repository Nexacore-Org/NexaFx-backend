import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeModule } from '../../src/modules/fees/fee.module';
import { FeeRule } from '../../src/modules/fees/fee.entity';
import { APP_GUARD } from '@nestjs/core';
import { MockJwtAuthGuard, MockRolesGuard } from '../mocks/mock-auth.guard';

describe('FeeController (e2e)', () => {
  let app: INestApplication;
  let id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [FeeRule],
          synchronize: true,
        }),
        FeeModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: MockJwtAuthGuard },
        { provide: APP_GUARD, useClass: MockRolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should create a fee rule', async () => {
    const response = await request(app.getHttpServer())
      .post('/fees')
      .send({
        userTier: 'Pro',
        transactionType: 'exchange',
        minVolume: 100,
        maxVolume: 10000,
        feePercentage: 1.5,
        discountPercentage: 0.5,
        isActive: true,
      })
      .expect(201);

    id = response.body.id;
    expect(response.body.feePercentage).toBe(1.5);
  });

  it('should retrieve all fee rules', async () => {
    const response = await request(app.getHttpServer()).get('/fees').expect(200);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should get one fee rule by ID', async () => {
    const response = await request(app.getHttpServer()).get(`/fees/${id}`).expect(200);
    expect(response.body.id).toBe(id);
  });

  it('should update the fee rule', async () => {
    const response = await request(app.getHttpServer())
      .put(`/fees/${id}`)
      .send({ feePercentage: 2.0 })
      .expect(200);

    expect(response.body.feePercentage).toBe(2.0);
  });

  it('should delete the fee rule', async () => {
    await request(app.getHttpServer()).delete(`/fees/${id}`).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});

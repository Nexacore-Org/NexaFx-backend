import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionsModule } from './conversions.module';
import { Currency } from '../currencies/entities/currency.entity';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('ConversionsController (e2e)', () => {
  let app: INestApplication;
  let mockJwtAuthGuard: any;
  let mockRolesGuard: any;

  beforeAll(async () => {
    mockJwtAuthGuard = {
      canActivate: jest.fn().mockImplementation(() => true),
    };

    mockRolesGuard = {
      canActivate: jest.fn().mockImplementation(() => true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Currency],
          synchronize: true,
        }),
        ConversionsModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /conversions/simulate', () => {
    it('should return 400 for invalid currency', () => {
      return request(app.getHttpServer())
        .post('/conversions/simulate')
        .send({
          fromCurrency: 'INVALID',
          toCurrency: 'BTC',
          amount: 1000,
        })
        .expect(400);
    });

    it('should return 400 for negative amount', () => {
      return request(app.getHttpServer())
        .post('/conversions/simulate')
        .send({
          fromCurrency: 'USD',
          toCurrency: 'BTC',
          amount: -1000,
        })
        .expect(400);
    });

    it('should return 400 for missing required fields', () => {
      return request(app.getHttpServer())
        .post('/conversions/simulate')
        .send({
          fromCurrency: 'USD',
          // missing toCurrency and amount
        })
        .expect(400);
    });

    it('should return 401 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockImplementationOnce(() => false);

      return request(app.getHttpServer())
        .post('/conversions/simulate')
        .send({
          fromCurrency: 'USD',
          toCurrency: 'BTC',
          amount: 1000,
        })
        .expect(401);
    });

    it('should return 403 when user role not authorized', async () => {
      mockRolesGuard.canActivate.mockImplementationOnce(() => false);

      return request(app.getHttpServer())
        .post('/conversions/simulate')
        .send({
          fromCurrency: 'USD',
          toCurrency: 'BTC',
          amount: 1000,
        })
        .expect(403);
    });
  });
}); 
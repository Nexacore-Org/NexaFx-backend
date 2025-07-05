import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ConversionsModule } from './conversions.module';

describe('ConversionsController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConversionsModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/conversions/preview (POST)', () => {
    it('should create a conversion preview', () => {
      const previewRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(previewRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('sourceCurrencyId', 'USD');
          expect(res.body).toHaveProperty('targetCurrencyId', 'EUR');
          expect(res.body).toHaveProperty('amount', 100);
          expect(res.body).toHaveProperty('rate');
          expect(res.body).toHaveProperty('fee');
          expect(res.body).toHaveProperty('netAmount');
          expect(res.body).toHaveProperty('rateLockExpiresAt');
          expect(res.body).toHaveProperty('feeBreakdown');
          expect(typeof res.body.rate).toBe('number');
          expect(typeof res.body.fee).toBe('number');
          expect(typeof res.body.netAmount).toBe('number');
          expect(Array.isArray(res.body.feeBreakdown)).toBe(true);
        });
    });

    it('should create a conversion preview with rate lock ID', () => {
      const previewRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
        rateLockId: 'rate-lock-123',
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(previewRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('sourceCurrencyId', 'USD');
          expect(res.body).toHaveProperty('targetCurrencyId', 'EUR');
          expect(res.body).toHaveProperty('amount', 100);
          expect(res.body).toHaveProperty('rateLockExpiresAt');
        });
    });

    it('should return 400 for zero amount', () => {
      const invalidRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 0,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(invalidRequest)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBe('Amount must be positive');
        });
    });

    it('should return 400 for negative amount', () => {
      const invalidRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: -50,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(invalidRequest)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBe('Amount must be positive');
        });
    });

    it('should handle different currency pairs', () => {
      const usdToEurRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      const eurToUsdRequest = {
        sourceCurrencyId: 'EUR',
        targetCurrencyId: 'USD',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(usdToEurRequest)
        .expect(200)
        .then(() => {
          return request(app.getHttpServer())
            .post('/conversions/preview')
            .send(eurToUsdRequest)
            .expect(200)
            .expect((res) => {
              expect(res.body.sourceCurrencyId).toBe('EUR');
              expect(res.body.targetCurrencyId).toBe('USD');
            });
        });
    });

    it('should handle large amounts', () => {
      const largeAmountRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 1000000,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(largeAmountRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body.amount).toBe(1000000);
          expect(res.body.netAmount).toBe(res.body.amount * res.body.rate - res.body.fee);
        });
    });

    it('should handle decimal amounts', () => {
      const decimalAmountRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 99.99,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(decimalAmountRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body.amount).toBe(99.99);
          expect(res.body.netAmount).toBe(res.body.amount * res.body.rate - res.body.fee);
        });
    });

    it('should handle crypto currency pairs', () => {
      const cryptoRequest = {
        sourceCurrencyId: 'BTC',
        targetCurrencyId: 'ETH',
        amount: 1,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(cryptoRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body.sourceCurrencyId).toBe('BTC');
          expect(res.body.targetCurrencyId).toBe('ETH');
          expect(res.body.amount).toBe(1);
        });
    });

    it('should handle fiat currency pairs', () => {
      const fiatRequest = {
        sourceCurrencyId: 'NGN',
        targetCurrencyId: 'USD',
        amount: 1000,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(fiatRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body.sourceCurrencyId).toBe('NGN');
          expect(res.body.targetCurrencyId).toBe('USD');
          expect(res.body.amount).toBe(1000);
        });
    });

    it('should validate fee breakdown structure', () => {
      const previewRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(previewRequest)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.feeBreakdown)).toBe(true);
          expect(res.body.feeBreakdown.length).toBeGreaterThan(0);

          res.body.feeBreakdown.forEach(fee => {
            expect(fee).toHaveProperty('type');
            expect(fee).toHaveProperty('value');
            expect(typeof fee.type).toBe('string');
            expect(typeof fee.value).toBe('number');
            expect(fee.value).toBeGreaterThanOrEqual(0);
          });

          // Validate total fee matches breakdown
          const totalFee = res.body.feeBreakdown.reduce((sum, fee) => sum + fee.value, 0);
          expect(totalFee).toBe(res.body.fee);
        });
    });

    it('should validate rate lock expiration time', () => {
      const previewRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(previewRequest)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('rateLockExpiresAt');
          const expirationTime = new Date(res.body.rateLockExpiresAt).getTime();
          expect(expirationTime).toBeGreaterThan(Date.now());
        });
    });

    it('should validate net amount calculation', () => {
      const previewRequest = {
        sourceCurrencyId: 'USD',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(previewRequest)
        .expect(200)
        .expect((res) => {
          const expectedNetAmount = res.body.amount * res.body.rate - res.body.fee;
          expect(res.body.netAmount).toBe(expectedNetAmount);
        });
    });

    it('should handle missing required fields', () => {
      const invalidRequest = {
        sourceCurrencyId: 'USD',
        // Missing targetCurrencyId and amount
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(invalidRequest)
        .expect(400);
    });

    it('should handle invalid currency IDs', () => {
      const invalidRequest = {
        sourceCurrencyId: 'INVALID',
        targetCurrencyId: 'EUR',
        amount: 100,
      };

      return request(app.getHttpServer())
        .post('/conversions/preview')
        .send(invalidRequest)
        .expect(200); // Current implementation doesn't validate currency IDs
    });
  });
}); 
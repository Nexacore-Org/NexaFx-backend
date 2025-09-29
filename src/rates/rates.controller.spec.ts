import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { KycVerification } from '../kyc/entities/kyc.entity';
import { User } from '../user/entities/user.entity';
import { Token } from '../auth/entities/token.entity';
import { AuthService } from '../auth/services/auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { BcryptPasswordHashingService } from '../auth/services/passwod.hashing.service';

describe('RatesController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({})
      .overrideProvider(getRepositoryToken(Currency))
      .useValue({
        findOne: jest.fn().mockImplementation(({ where }) => {
          const supported = ['USD', 'NGN', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT'];
          const code = (where.code || '').toUpperCase();
          if (supported.includes(code)) {
            return Promise.resolve({
              code,
              exchangeRate: 1,
              lastUpdated: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
      })
      .overrideProvider(getRepositoryToken(KycVerification))
      .useValue({})
      .overrideProvider(getRepositoryToken(User))
      .useValue({})
      .overrideProvider(getRepositoryToken(Token))
      .useValue({})
      .overrideProvider(AuthService)
      .useValue({})
      .overrideProvider(UserService)
      .useValue({})
      .overrideProvider(JwtService)
      .useValue({})
      .overrideProvider(BcryptPasswordHashingService)
      .useValue({})
      .overrideProvider(
        require('../currencies/currencies.service').CurrenciesService,
      )
      .useValue({
        findOne: jest.fn().mockImplementation((code) => {
          const supported = ['USD', 'NGN', 'EUR', 'GBP', 'BTC', 'ETH', 'USDT'];
          const upper = (code || '').toUpperCase();
          if (supported.includes(upper)) {
            return Promise.resolve({
              code: upper,
              exchangeRate: 1,
              lastUpdated: new Date(),
            });
          }
          return Promise.resolve(null);
        }),
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new (require('@nestjs/common').ValidationPipe)({ transform: true }),
    );
    await app.init();
  });

  it('/rates?source=SRC&target=TGT&amount=2 (GET)', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'USD', target: 'NGN', amount: 2 })
      .expect((res) => {
        if (res.status !== 200) {
          // Print the body for debugging
          // eslint-disable-next-line no-console
          console.log('RESPONSE BODY:', res.body);
        }
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveProperty('rate');
        expect(body).toHaveProperty('fee');
        expect(body).toHaveProperty('netAmount');
        expect(body).toHaveProperty('expiresAt');
      });
  });

  it('should fail if source and target are the same', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'USD', target: 'usd', amount: 1 })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toMatch(
          /Source and target currencies must be different/,
        );
      });
  });

  it('should fail for unsupported source currency', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'XXX', target: 'USD', amount: 1 })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toMatch(/Unsupported source currency/);
      });
  });

  it('should fail for unsupported target currency', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'USD', target: 'YYY', amount: 1 })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toMatch(/Unsupported target currency/);
      });
  });

  it('should fail for invalid amount', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'USD', target: 'EUR', amount: 0 })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/Amount must be a positive number/i),
          ]),
        );
      });
  });

  it('should work for lowercase codes (case-insensitive)', () => {
    return request(app.getHttpServer())
      .get('/rates')
      .query({ source: 'usd', target: 'ngn', amount: 1 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveProperty('rate');
      });
  });
});

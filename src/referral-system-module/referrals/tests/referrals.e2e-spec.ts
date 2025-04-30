// src/referrals/tests/referrals.e2e-spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ReferralsModule } from '../referrals.module';
import { Referral } from '../entities/referral.entity';
import { ReferralsService } from '../referrals.service';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { ConfigModule } from '@nestjs/config';

describe('Referrals E2E Tests', () => {
  let app: INestApplication;
  let referralsService: ReferralsService;
  let jwtService: JwtService;
  let authToken: string;
  let userId: string;
  let referralCode: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Referral],
          synchronize: true,
        }),
        ReferralsModule,
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    
    referralsService = moduleFixture.get<ReferralsService>(ReferralsService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
    
    await app.init();
    
    // Setup test user and auth token
    userId = 'test-user-id';
    authToken = jwtService.sign({ sub: userId, email: 'test@example.com' });
  });

  describe('/referrals/generate (POST)', () => {
    it('should generate a referral code for authenticated user', () => {
      return request(app.getHttpServer())
        .post('/referrals/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201)
        .then(response => {
          expect(response.body).toHaveProperty('code');
          referralCode = response.body.code;
        });
    });

    it('should return 401 for unauthenticated requests', () => {
      return request(app.getHttpServer())
        .post('/referrals/generate')
        .expect(401);
    });
  });

  describe('/referrals/me (GET)', () => {
    it('should return referrals made by the authenticated user', () => {
      return request(app.getHttpServer())
        .get('/referrals/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then(response => {
          expect(Array.isArray(response.body)).toBeTruthy();
        });
    });
  });

  describe('/referrals/validate/:code (GET)', () => {
    it('should validate an existing referral code', () => {
      return request(app.getHttpServer())
        .get(`/referrals/validate/${referralCode}`)
        .expect(200)
        .then(response => {
          expect(response.body).toHaveProperty('valid', true);
        });
    });

    it('should return false for invalid referral code', () => {
      return request(app.getHttpServer())
        .get('/referrals/validate/invalid-code')
        .expect(200)
        .then(response => {
          expect(response.body).toHaveProperty('valid', false);
        });
    });
  });

  describe('/referrals/use (POST)', () => {
    it('should use a valid referral code', () => {
      const referredUserId = 'new-user-id';
      
      return request(app.getHttpServer())
        .post('/referrals/use')
        .send({
          code: referralCode,
          referredUserId,
        })
        .expect(200)
        .then(response => {
          expect(response.body).toHaveProperty('success', true);
        });
    });

    it('should fail when using an already used code', () => {
      const anotherUserId = 'another-user-id';
      
      return request(app.getHttpServer())
        .post('/referrals/use')
        .send({
          code: referralCode,
          referredUserId: anotherUserId,
        })
        .expect(404);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
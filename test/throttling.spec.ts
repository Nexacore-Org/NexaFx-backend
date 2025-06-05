import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../src/throttler/custom-throttler.guard';

describe('Throttling', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule,
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 3, // Lower limit for testing
        }]),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new CustomThrottlerGuard());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Global throttling', () => {
    it('should allow requests within the limit', async () => {
      await request(app.getHttpServer()).get('/').expect(200);
      await request(app.getHttpServer()).get('/').expect(200);
      await request(app.getHttpServer()).get('/').expect(200);
    });

    it('should block requests exceeding the limit', async () => {
      await request(app.getHttpServer()).get('/').
      expect(200);
      await request(app.getHttpServer()).get('/').expect(200);
      await request(app.getHttpServer()).get('/').expect(200);
      
      const response = await request(app.getHttpServer()).get('/');
      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Critical route throttling', () => {
    it('should apply stricter limits to critical routes', async () => {
      // Test with mocked login route - adjust according to your actual routes
      await request(app.getHttpServer()).post('/auth/login').expect(200);
  // This should be blocked due to the lower limit (10 per minute)
      // For testing purposes, we've set it even lower
      const response = await request(app.getHttpServer()).post('/auth/login');
      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Exempt routes', () => {
    it('should exempt admin routes from throttling', async () => {
      // Multiple requests to admin routes should succeed
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).get('/admin/dashboard').expect(200);
      }
    });
    it('should exempt internal routes from throttling', async () => {
        // Multiple requests to internal routes should succeed
        for (let i = 0; i < 5; i++) {
          await request(app.getHttpServer()).get('/internal/metrics').expect(200);
        }
      });
    });
  });
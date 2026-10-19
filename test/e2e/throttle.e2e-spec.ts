import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { buildThrottlerOptions } from 'src/common/throttler/throttler.config';

@Controller('throttle-probe')
class ThrottleProbeController {
  @Get()
  ping() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    // String env values, exactly as ConfigService hands them over.
    ThrottlerModule.forRoot(
      buildThrottlerOptions({ THROTTLE_TTL: '1', THROTTLE_LIMIT: '2' }),
    ),
  ],
  controllers: [ThrottleProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleProbeModule {}

/**
 * #1327: with a string THROTTLE_TTL the throttler stored a nonsense expiry
 * (`Date.now() + '60'`) and locked a client out until the process restarted.
 * The window must expire normally.
 */
describe('Global throttler with string env values (#1327)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottleProbeModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after exceeding the limit and 200 again once the window passes', async () => {
    await request(app.getHttpServer()).get('/throttle-probe').expect(200);
    await request(app.getHttpServer()).get('/throttle-probe').expect(200);
    await request(app.getHttpServer()).get('/throttle-probe').expect(429);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    await request(app.getHttpServer()).get('/throttle-probe').expect(200);
  });
});

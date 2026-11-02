jest.mock('@nestjs/config', () => {
  class ConfigService {
    get(key: string) {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }
  }
  class ConfigModule {
    static forRoot() {
      return {
        module: ConfigModule,
        global: true,
        providers: [ConfigService],
        exports: [ConfigService],
      };
    }
  }
  return { ConfigService, ConfigModule };
});

jest.mock('typeorm', () => ({
  Repository: class Repository {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { REDIS_CLIENT } from './redis.constants';
import { createMockRedisClient } from '../../../test/mocks/factories';

describe('RedisModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 })],
        }),
        RedisModule,
      ],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(createMockRedisClient())
      .compile();
  });

  it('should compile the module and export RedisService, RedisThrottlerStorage, and REDIS_CLIENT', () => {
    expect(module).toBeDefined();

    const service = module.get<RedisService>(RedisService);
    const throttlerStorage = module.get<RedisThrottlerStorage>(
      RedisThrottlerStorage,
    );
    const client = module.get(REDIS_CLIENT);

    expect(service).toBeDefined();
    expect(throttlerStorage).toBeDefined();
    expect(client).toBeDefined();
  });
});

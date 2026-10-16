import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';
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

  it('should compile the module and export RedisService and REDIS_CLIENT', () => {
    expect(module).toBeDefined();

    const service = module.get<RedisService>(RedisService);
    const client = module.get(REDIS_CLIENT);

    expect(service).toBeDefined();
    expect(client).toBeDefined();
  });
});
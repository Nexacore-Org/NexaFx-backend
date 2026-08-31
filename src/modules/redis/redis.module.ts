import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { REDIS_CLIENT } from './redis.constants';
import { getQueueRedisConnection } from '../queues/queue-connection';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        // Return configured options or client instance
        return getQueueRedisConnection(configService);
      },
      inject: [ConfigService],
    },
    RedisService,
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisService, RedisThrottlerStorage],
})
export class RedisModule {}

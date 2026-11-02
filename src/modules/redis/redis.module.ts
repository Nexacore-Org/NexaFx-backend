import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const url =
          configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const connectTimeout = Number(
          configService.get<string | number>('REDIS_CONNECT_TIMEOUT_MS') ??
            1000,
        );

        const client = new Redis(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout:
            Number.isFinite(connectTimeout) && connectTimeout > 0
              ? connectTimeout
              : 1000,
          retryStrategy: () => null,
        });

        client.on('error', (error) => {
          logger.warn(`Redis connection error: ${error.message}`);
        });

        client.connect().catch((error) => {
          logger.warn(
            `Redis unavailable at startup; app will degrade gracefully: ${error.message}`,
          );
        });

        return client;
      },
      inject: [ConfigService],
    },
    RedisService,
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisService, RedisThrottlerStorage],
})
export class RedisModule {}

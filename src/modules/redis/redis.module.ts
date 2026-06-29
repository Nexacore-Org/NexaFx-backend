import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

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

        const client = new Redis(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
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
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
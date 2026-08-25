import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FlagsService } from './flags.service';
import { FlagsController } from './flags.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag]),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          const store = await redisStore({ url: redisUrl });
          return { store };
        }
        return {}; // fallback to in-memory if REDIS_URL not configured locally
      },
    }),
  ],
  controllers: [FlagsController],
  providers: [FlagsService],
  exports: [FlagsService],
})
export class FlagsModule {}

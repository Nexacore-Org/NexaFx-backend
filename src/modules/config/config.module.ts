import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformConfig } from './entities/platform-config.entity';
import { ConfigVersion } from './entities/config-version.entity';
import { RedisModule } from '../redis/redis.module';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformConfig, ConfigVersion]),
    RedisModule,
  ],
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}

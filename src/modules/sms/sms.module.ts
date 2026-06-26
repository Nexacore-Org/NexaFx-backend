import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [SmsService],
  controllers: [SmsController],
  exports: [SmsService],
})
export class SmsModule {}

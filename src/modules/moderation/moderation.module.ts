import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentModerationEvent } from './entities/content-moderation-event.entity';
import { ContentModerationService } from './content-moderation.service';
import { ModerationController } from './moderation.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentModerationEvent]),
    RedisModule,
  ],
  controllers: [ModerationController],
  providers: [ContentModerationService],
  exports: [ContentModerationService],
})
export class ModerationModule {}

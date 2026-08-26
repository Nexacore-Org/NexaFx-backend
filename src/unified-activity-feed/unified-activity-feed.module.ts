import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnifiedActivityFeedController } from './unified-activity-feed.controller';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';
import { ActivityFeedItem } from './entities/activity-feed-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityFeedItem])],
  controllers: [UnifiedActivityFeedController],
  providers: [UnifiedActivityFeedService],
  exports: [UnifiedActivityFeedService],
})
export class UnifiedActivityFeedModule {}

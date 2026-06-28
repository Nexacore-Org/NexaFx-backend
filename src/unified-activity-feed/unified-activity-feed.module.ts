import { Module } from '@nestjs/common';
import { UnifiedActivityFeedController } from './unified-activity-feed.controller';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';

@Module({
  controllers: [UnifiedActivityFeedController],
  providers: [UnifiedActivityFeedService],
  exports: [UnifiedActivityFeedService],
})
export class UnifiedActivityFeedModule {}

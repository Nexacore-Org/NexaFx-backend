import { Controller, Get, Post, NotImplementedException } from '@nestjs/common';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';

/**
 * Stub controller for v2 feature: unified-activity-feed (issue #488).
 * Routes are prefixed with /v2 to align with the v2 branch base.
 * Closes #488.
 */
@Controller('v2/unified-activity-feed')
export class UnifiedActivityFeedController {
  constructor(private readonly service: UnifiedActivityFeedService) {}

  @Get()
  list(): never {
    throw new NotImplementedException('Closes #488 - scaffold stub');
  }

  @Post()
  create(): never {
    throw new NotImplementedException('Closes #488 - scaffold stub');
  }
}

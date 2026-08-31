import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { UnifiedActivityFeedService } from './unified-activity-feed.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('Activity Feed')
@ApiBearerAuth('access-token')
@Controller('v2/unified-activity-feed')
@UseGuards(JwtAuthGuard)
export class UnifiedActivityFeedController {
  constructor(private readonly service: UnifiedActivityFeedService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated activity feed for the authenticated user' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items to return' })
  @ApiResponse({ status: 200, description: 'Paginated activity feed items' })
  async getFeed(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 10;
    return this.service.getFeed(req.user.userId, cursor, parsedLimit);
  }
}

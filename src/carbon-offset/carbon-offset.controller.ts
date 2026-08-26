import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CarbonOffsetService } from './carbon-offset.service';
import { Public } from '../auth/decorators/public.decorator';

interface AuthedRequest {
  user: { userId: string };
}

@ApiTags('carbon-offset')
@Controller()
export class CarbonOffsetController {
  constructor(private readonly service: CarbonOffsetService) {}

  /** #696: public community carbon-offset stats. */
  @Public()
  @ApiOperation({ summary: 'Public community carbon-offset stats' })
  @Get('v2/carbon/community')
  getCommunity() {
    return this.service.getCommunityStats();
  }

  /** #696: current user's offset stats. */
  @ApiOperation({ summary: "Current user's carbon-offset stats" })
  @Get('v2/users/me/carbon-offset/stats')
  getMyStats(@Req() req: AuthedRequest) {
    return this.service.getStats(req.user.userId);
  }

  /** #696: current user's offset history (paginated). */
  @ApiOperation({ summary: "Current user's carbon-offset history" })
  @Get('v2/users/me/carbon-offset/history')
  getMyHistory(
    @Req() req: AuthedRequest,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getHistory(req.user.userId, Number(page), Number(limit));
  }
}

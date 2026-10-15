import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PortfolioService } from './portfolio.service';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Portfolio')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('v2/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  /**
   * Compute current portfolio valuation and persist a snapshot.
   * Clients should poll this endpoint periodically; the cron job also calls
   * the underlying service to record daily snapshots automatically.
   */
  @Post('value')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compute current portfolio value and save snapshot',
  })
  @ApiOkResponse({
    description: 'Live portfolio valuation with per-asset breakdown',
  })
  async computeValue(@CurrentUser() user: CurrentUserPayload) {
    // The JWT payload carries userId; `user.id` is undefined, so every handler
    // threw a TypeError.
    return this.portfolioService.computeAndSnapshot(user.userId);
  }

  /**
   * Retrieve the most recent persisted snapshot without re-fetching live rates.
   */
  @Get('snapshot')
  @ApiOperation({ summary: 'Retrieve the latest portfolio snapshot' })
  @ApiOkResponse({ description: 'Most recent portfolio snapshot' })
  async latestSnapshot(@CurrentUser() user: CurrentUserPayload) {
    return this.portfolioService.getLatestSnapshot(user.userId);
  }

  /**
   * Fetch snapshot history for charting. Defaults to the 30 most recent
   * snapshots; capped at 90 per request.
   */
  @Get('history')
  @ApiOperation({
    summary: 'Fetch portfolio snapshot history (up to 90 entries)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of snapshots (default 30, max 90)',
  })
  async history(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    // take: 0 means "no limit" to TypeORM, so the cap has a lower bound too.
    if (limit < 1 || limit > 90) {
      throw new BadRequestException('limit must be between 1 and 90');
    }

    return this.portfolioService.getHistory(user.userId, limit);
  }
}

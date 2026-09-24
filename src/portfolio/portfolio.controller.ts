import {
  Controller,
  Get,
  Post,
  Query,
  Request,
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
  @ApiOperation({ summary: 'Compute current portfolio value and save snapshot' })
  @ApiOkResponse({ description: 'Live portfolio valuation with per-asset breakdown' })
  async computeValue(@Request() req) {
    return this.portfolioService.computeAndSnapshot(req.user.id.toString());
  }

  /**
   * Retrieve the most recent persisted snapshot without re-fetching live rates.
   */
  @Get('snapshot')
  @ApiOperation({ summary: 'Retrieve the latest portfolio snapshot' })
  @ApiOkResponse({ description: 'Most recent portfolio snapshot' })
  async latestSnapshot(@Request() req) {
    return this.portfolioService.getLatestSnapshot(req.user.id.toString());
  }

  /**
   * Fetch snapshot history for charting. Defaults to the 30 most recent
   * snapshots; capped at 90 per request.
   */
  @Get('history')
  @ApiOperation({ summary: 'Fetch portfolio snapshot history (up to 90 entries)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of snapshots (default 30, max 90)' })
  async history(
    @Request() req,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.portfolioService.getHistory(req.user.id.toString(), limit);
  }
}

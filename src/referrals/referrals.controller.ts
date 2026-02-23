import { Controller, Get, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { ReferralStatsDto } from './dto/referral-stats.dto';
import { ReferralItemDto } from './dto/referral-item.dto';

@ApiTags('Referrals')
@ApiBearerAuth('access-token')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get my referral stats and referral code' })
  @ApiResponse({
    status: 200,
    description: 'Referral statistics fetched successfully',
    type: ReferralStatsDto,
  })
  async getStats(
    @Request() req: { user: { userId: string } },
  ): Promise<ReferralStatsDto> {
    return this.referralsService.getReferralStats(req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List users referred by the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Referrals fetched successfully',
    type: [ReferralItemDto],
  })
  async getMyReferrals(
    @Request() req: { user: { userId: string } },
  ): Promise<ReferralItemDto[]> {
    return this.referralsService.getUserReferrals(req.user.userId);
  }
}

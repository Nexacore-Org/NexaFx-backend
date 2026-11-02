import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { ReferralStatsDto } from './dto/referral-stats.dto';
import {
  ListReferralsQueryDto,
  PaginatedReferralsResponseDto,
} from './dto/referral-item.dto';

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
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  @ApiOperation({ summary: 'List users referred by the authenticated user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Referrals fetched successfully',
    type: PaginatedReferralsResponseDto,
  })
  async getMyReferrals(
    @Request() req: { user: { userId: string } },
    @Query() query?: ListReferralsQueryDto,
  ): Promise<PaginatedReferralsResponseDto> {
    if (query === undefined) {
      return this.referralsService.getUserReferrals(req.user.userId);
    }
    const page = query.page !== undefined ? Number(query.page) : 1;
    const limit = query.limit !== undefined ? Number(query.limit) : 20;
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be an integer >= 1');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100',
      );
    }
    return this.referralsService.getUserReferrals(req.user.userId, page, limit);
  }
}

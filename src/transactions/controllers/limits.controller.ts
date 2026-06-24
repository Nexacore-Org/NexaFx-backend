import {
  Controller,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { TransactionLimitService, LimitStatusResponse } from '../services/transaction-limit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Limits')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('limits')
export class LimitsController {
  constructor(private readonly limitService: TransactionLimitService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user transaction limits and remaining allowance',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns user limits and remaining daily/monthly allowance',
    schema: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['UNVERIFIED', 'BASIC', 'ENHANCED', 'FULL'],
          description: 'User KYC tier',
        },
        limits: {
          type: 'object',
          properties: {
            dailyLimitUsd: { type: 'number' },
            monthlyLimitUsd: { type: 'number' },
            singleTxLimitUsd: { type: 'number' },
          },
        },
        usage: {
          type: 'object',
          properties: {
            todayUsd: { type: 'number' },
            monthUsd: { type: 'number' },
          },
        },
        remaining: {
          type: 'object',
          properties: {
            dailyUsd: { type: 'number' },
            monthlyUsd: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserLimits(@Request() req): Promise<LimitStatusResponse> {
    return this.limitService.getUserLimitStatus(req.user.userId);
  }
}

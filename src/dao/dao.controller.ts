import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DaoService } from './dao.service';
import { DistributeRewardDto } from './dto/distribute-reward.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('DAO')
@Controller('dao')
@ApiBearerAuth('access-token')
export class DaoController {
  constructor(private readonly daoService: DaoService) {}

  @Post('distribute-reward')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Trigger DAO reward distribution via Soroban contract',
  })
  @ApiResponse({ status: 201, description: 'Reward distribution queued' })
  @ApiResponse({ status: 400, description: 'Invalid reward request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async distributeReward(
    @Request()
    req: {
      user: { userId: string };
      headers?: Record<string, string | string[] | undefined>;
    },
    @Body() distributeRewardDto: DistributeRewardDto,
  ) {
    const headerIdempotencyKey =
      req.headers?.['idempotency-key'] ?? req.headers?.['x-request-id'];
    const requestId =
      distributeRewardDto.requestId ??
      (Array.isArray(headerIdempotencyKey)
        ? headerIdempotencyKey[0]
        : headerIdempotencyKey);

    return this.daoService.distributeReward(
      req.user.userId,
      distributeRewardDto,
      requestId,
    );
  }

  @Get('distributions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List reward distributions with pagination' })
  @ApiResponse({ status: 200, description: 'Distributions list' })
  async getDistributions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.daoService.getDistributions(Number(page), Number(limit));
  }
}

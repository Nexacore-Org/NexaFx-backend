import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { FeesService } from './fees.service';
import { CreateFeeConfigDto } from './dtos/create-fee-config.dto';
import { UpdateFeeConfigDto } from './dtos/update-fee-config.dto';
import { FeeEstimateQueryDto } from './dtos/fee-estimate-query.dto';
import {
  FeeConfigResponseDto,
  FeeEstimateResponseDto,
} from './dtos/fee-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Fees')
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  // ── Public endpoint ────────────────────────────────────────────────────────

  @Get('estimate')
  @Public()
  @ApiOperation({
    summary: 'Preview the fee for a transaction (no auth required)',
  })
  @ApiResponse({
    status: 200,
    description: 'Fee estimate calculated successfully',
    type: FeeEstimateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async estimateFee(
    @Query() query: FeeEstimateQueryDto,
  ): Promise<FeeEstimateResponseDto> {
    const fee = await this.feesService.calculateFee(
      query.type,
      query.currency,
      query.amount,
    );

    const netAmount = query.amount - fee.feeAmount;

    return {
      feeAmount: fee.feeAmount.toFixed(8),
      feeCurrency: fee.feeCurrency,
      feeType: fee.feeType,
      grossAmount: query.amount.toFixed(8),
      netAmount: netAmount.toFixed(8),
    };
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all fee configurations (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all fee configurations',
    type: [FeeConfigResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin role required' })
  async getFeeConfigs(): Promise<FeeConfigResponseDto[]> {
    return this.feesService.getFeeConfigs();
  }

  @Post('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new fee configuration rule (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Fee configuration created successfully',
    type: FeeConfigResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin role required' })
  async createFeeConfig(
    @Body() dto: CreateFeeConfigDto,
  ): Promise<FeeConfigResponseDto> {
    return this.feesService.createFeeConfig(dto);
  }

  @Patch('config/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a fee configuration rule (admin only)' })
  @ApiParam({
    name: 'id',
    description: 'Fee config UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Fee configuration updated successfully',
    type: FeeConfigResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin role required' })
  @ApiResponse({ status: 404, description: 'Fee config not found' })
  async updateFeeConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeConfigDto,
  ): Promise<FeeConfigResponseDto> {
    return this.feesService.updateFeeConfig(id, dto);
  }
}

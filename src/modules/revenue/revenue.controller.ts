import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RevenueService, GenerateSnapshotOptions } from './revenue.service';
import {
  RevenueSnapshot,
  RevenuePeriodType,
} from './entities/revenue-snapshot.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

export class GenerateSnapshotDto {
  periodType: RevenuePeriodType;
  periodStart: string;
  periodEnd: string;
  forceRecalculate?: boolean;
}

export class QuerySnapshotsDto {
  periodType?: RevenuePeriodType;
  startDate?: string;
  endDate?: string;
}

@ApiTags('Revenue & Financial Reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('revenue')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Post('snapshots/generate')
  @ApiOperation({
    summary: 'Generate revenue snapshot for period (Admin/SuperAdmin only)',
    description: 'Aggregates platform transaction fees and volumes with Decimal.js precision.',
  })
  @ApiResponse({ status: 201, description: 'Snapshot generated or retrieved successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden. Non-admin users cannot access financial reporting.' })
  async generateSnapshot(
    @Body() dto: GenerateSnapshotDto,
  ): Promise<RevenueSnapshot> {
    return this.revenueService.generateSnapshot({
      periodType: dto.periodType,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      forceRecalculate: dto.forceRecalculate,
    });
  }

  @Get('snapshots')
  @ApiOperation({
    summary: 'List revenue snapshots (Admin/SuperAdmin only)',
    description: 'Retrieves historical financial revenue snapshots.',
  })
  @ApiResponse({ status: 200, description: 'List of snapshots.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async getSnapshots(
    @Query() query: QuerySnapshotsDto,
  ): Promise<RevenueSnapshot[]> {
    return this.revenueService.getSnapshots({
      periodType: query.periodType,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Get aggregated financial revenue summary (Admin/SuperAdmin only)',
    description: 'Returns total volume and fee earnings for a specific date range.',
  })
  @ApiResponse({ status: 200, description: 'Summary financial data.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async getRevenueSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.revenueService.getRevenueSummary(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('snapshots/:id/finalize')
  @ApiOperation({
    summary: 'Finalize revenue snapshot (Admin/SuperAdmin only)',
    description: 'Locks a revenue snapshot preventing future automated overwrites.',
  })
  @ApiResponse({ status: 200, description: 'Snapshot finalized successfully.' })
  @ApiResponse({ status: 404, description: 'Snapshot not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async finalizeSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevenueSnapshot> {
    return this.revenueService.finalizeSnapshot(id);
  }
}

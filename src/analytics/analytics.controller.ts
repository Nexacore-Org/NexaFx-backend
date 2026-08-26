import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AssignCategoryDto } from './dto/assign-category.dto';
import { ExportFormat } from './entities/report-export-job.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get spending summary', description: 'Returns aggregated spending data by category and date range for the authenticated user' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'categoryId', required: false, type: String, description: 'Filter by category ID' })
  @ApiResponse({ status: 200, description: 'Spending summary retrieved successfully', type: 'object' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSummary(@CurrentUser() user: CurrentUserPayload, @Query() query: SummaryQueryDto) {
    return this.analyticsService.getSpendingSummary(user.userId, query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get user categories', description: 'Returns all custom categories for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully', isArray: true, type: 'object' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getCategories(@CurrentUser() user: CurrentUserPayload) {
    return this.analyticsService.findUserCategories(user.userId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a custom category', description: 'Creates a new spending category for the authenticated user' })
  @ApiResponse({ status: 201, description: 'Category created successfully', type: 'object' })
  @ApiResponse({ status: 400, description: 'Invalid category data' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createCategory(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCategoryDto) {
    return this.analyticsService.createCategory(user.userId, dto);
  }

  @Post('assign-category')
  @ApiOperation({ summary: 'Assign a category to a transaction', description: 'Assigns an existing category to a transaction' })
  @ApiResponse({ status: 200, description: 'Category assigned successfully', type: 'object' })
  @ApiResponse({ status: 404, description: 'Transaction or category not found' })
  @ApiResponse({ status: 400, description: 'Invalid assignment' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  assignCategory(@CurrentUser() user: CurrentUserPayload, @Body() dto: AssignCategoryDto) {
    return this.analyticsService.assignCategory(user.userId, dto);
  }

  @Post('export')
  @ApiOperation({ summary: 'Create an export job', description: 'Creates a report export job for the authenticated user' })
  @ApiQuery({ name: 'format', enum: ExportFormat, required: false, description: 'Export format (default: CSV)' })
  @ApiResponse({ status: 201, description: 'Export job created', type: 'object' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createExportJob(
    @CurrentUser() user: CurrentUserPayload,
    @Query('format') format: ExportFormat = ExportFormat.CSV,
  ) {
    return this.analyticsService.createExportJob(user.userId, format);
  }

  @Get('balance-snapshots')
  @ApiOperation({ summary: 'Get balance snapshots', description: 'Returns recent balance snapshots for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Balance snapshots retrieved successfully', isArray: true, type: 'object' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getBalanceSnapshots(@CurrentUser() user: CurrentUserPayload) {
    return this.analyticsService.getUserBalanceSnapshots(user.userId);
  }
}

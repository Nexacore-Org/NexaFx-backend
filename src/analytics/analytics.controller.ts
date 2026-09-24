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
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AssignCategoryDto } from './dto/assign-category.dto';
import {
  SummaryQueryDto,
  TrendsQueryDto,
  BalanceHistoryQueryDto,
  ExportQueryDto,
} from './dto/summary-query.dto';

@ApiTags('Analytics')
@ApiBearerAuth('access-token')
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
  @Post('categories')
  @ApiOperation({ summary: 'Create a personal transaction category' })
  async createCategory(@Request() req, @Body() dto: CreateCategoryDto) {
    return this.analyticsService.createCategory(req.user.userId, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List system + personal categories' })
  async getCategories(@Request() req) {
    return this.analyticsService.getCategories(req.user.userId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Monthly breakdown of transactions' })
  @ApiQuery({ name: 'year', required: false, example: 2026 })
  @ApiQuery({ name: 'month', required: false, example: 6 })
  async getSummary(@Request() req, @Query() query: SummaryQueryDto) {
    const year = query.year || new Date().getFullYear();
    const month = query.month || new Date().getMonth() + 1;
    return this.analyticsService.getMonthlySummary(
      req.user.userId,
      year,
      month,
    );
  }

  @Get('trends')
  @ApiOperation({ summary: 'Month-over-month sent/received/net' })
  @ApiQuery({ name: 'months', required: false, example: 6 })
  async getTrends(@Request() req, @Query() query: TrendsQueryDto) {
    const months = query.months || 6;
    return this.analyticsService.getTrends(req.user.userId, months);
  }

  @Get('balance-history')
  @ApiOperation({ summary: 'Daily wallet balance snapshots' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getBalanceHistory(
    @Request() req,
    @Query() query: BalanceHistoryQueryDto,
  ) {
    const days = query.days || 30;
    return this.analyticsService.getBalanceHistory(req.user.userId, days);
  }

  @Post('export')
  @ApiOperation({ summary: 'Create a report export job (CSV or PDF)' })
  @ApiQuery({ name: 'format', example: 'csv' })
  @ApiQuery({ name: 'from', example: '2026-01-01T00:00:00Z' })
  @ApiQuery({ name: 'to', example: '2026-06-30T23:59:59Z' })
  async createExport(@Request() req, @Query() query: ExportQueryDto) {
    return this.analyticsService.createExportJob(
      req.user.userId,
      query.format,
      query.from,
      query.to,
    );
  }

  @Get('export/:id')
  @ApiOperation({ summary: 'Get export job status' })
  async getExportStatus(@Request() req, @Param('id') id: string) {
    return this.analyticsService.getExportJob(id, req.user.userId);
  }
}

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@Controller('transactions')
export class TransactionCategoryController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Patch(':id/category')
  @ApiOperation({ summary: 'Manually reassign a transaction category' })
  async assignCategory(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AssignCategoryDto,
  ) {
    return this.analyticsService.assignCategory(
      id,
      req.user.userId,
      dto.categoryId,
    );
  }
}

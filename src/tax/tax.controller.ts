import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { TaxService } from './tax.service';
import { TaxExportJurisdiction } from './entities/tax-export-job.entity';

export class CreateTaxExportDto {
  @ApiProperty({ example: 2026, description: 'Tax year' })
  @IsNumber()
  @Min(1970)
  year: number;

  @ApiProperty({ enum: TaxExportJurisdiction, example: TaxExportJurisdiction.US, description: 'Jurisdiction' })
  @IsEnum(TaxExportJurisdiction)
  @IsNotEmpty()
  jurisdiction: TaxExportJurisdiction;
}

@ApiTags('Tax')
@Controller('tax')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get annual tax summary' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Summary retrieved successfully' })
  async getSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('year') year?: string,
  ) {
    const parsedYear = year ? parseInt(year, 10) : new Date().getFullYear();
    if (isNaN(parsedYear)) {
      throw new BadRequestException('Invalid year format');
    }
    return this.taxService.getSummary(user.userId, parsedYear);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get paginated list of tax events' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'currency', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  async getEvents(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('currency') currency?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;

    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new BadRequestException('Invalid page parameter');
    }
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestException('Invalid limit parameter');
    }

    return this.taxService.getEvents(user.userId, parsedPage, parsedLimit, currency);
  }

  @Post('export')
  @ApiOperation({ summary: 'Enqueue a tax report CSV export' })
  @ApiResponse({ status: 202, description: 'CSV export job enqueued' })
  async exportTax(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTaxExportDto,
  ) {
    return this.taxService.enqueueExportJob(user.userId, dto.year, dto.jurisdiction);
  }

  @Get('export/status')
  @ApiOperation({ summary: 'Get CSV export job status by query parameter' })
  @ApiQuery({ name: 'jobId', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Export job status retrieved successfully' })
  async getExportStatusQuery(
    @CurrentUser() user: CurrentUserPayload,
    @Query('jobId') jobId: string,
  ) {
    if (!jobId) {
      throw new BadRequestException('jobId query parameter is required');
    }
    return this.taxService.getExportJobStatus(user.userId, jobId);
  }

  @Get('export/status/:jobId')
  @ApiOperation({ summary: 'Get CSV export job status by path parameter' })
  @ApiResponse({ status: 200, description: 'Export job status retrieved successfully' })
  async getExportStatusParam(
    @CurrentUser() user: CurrentUserPayload,
    @Param('jobId') jobId: string,
  ) {
    return this.taxService.getExportJobStatus(user.userId, jobId);
  }
}

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { CustomReportsService } from './custom-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateReportDefinitionDto, RunReportQueryDto } from './dto';

@Controller({ path: 'custom-reports', version: '2' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CustomReportsController {
  constructor(private readonly reportsService: CustomReportsService) {}

  @Post('definitions')
  public async createDefinition(
    @Body() dto: CreateReportDefinitionDto,
    @CurrentUser() user: any,
  ) {
    return this.reportsService.createDefinition(
      dto,
      user?.userId || user?.id || 'admin',
    );
  }

  @Get('definitions')
  public async listDefinitions() {
    return this.reportsService.listDefinitions();
  }

  @Get('definitions/:id')
  public async getDefinition(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.getDefinition(id);
  }

  @Delete('definitions/:id')
  public async deleteDefinition(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.deleteDefinition(id);
  }

  @Get('definitions/:id/run')
  public async runReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RunReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const format = query?.format || 'json';
    const result = await this.reportsService.runReport(id, format, {
      limit: query?.limit,
      offset: query?.offset,
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="report-${id}.csv"`,
      );
    }

    return result;
  }
}

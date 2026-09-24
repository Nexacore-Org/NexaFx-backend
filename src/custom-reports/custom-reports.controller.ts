import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CustomReportsService } from './custom-reports.service';
import { ReportEntityTarget } from './entities/custom-report-definition.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller({ path: 'custom-reports', version: '2' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CustomReportsController {
  constructor(private readonly reportsService: CustomReportsService) {}

  @Post('definitions')
  public async createDefinition(
    @Body('name') name: string,
    @Body('entity') entity: ReportEntityTarget,
    @Body('filters') filters: Record<string, any>,
    @Body('columns') columns: string[],
    @CurrentUser() user: any,
  ) {
    return this.reportsService.createDefinition(
      name,
      entity,
      filters,
      columns,
      user.userId,
    );
  }

  @Get('definitions/:id/run')
  public async runReport(
    @Param('id') id: string,
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    return this.reportsService.runReport(id, format);
  }
}

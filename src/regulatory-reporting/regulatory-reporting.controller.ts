import { Controller, Get, UseGuards } from '@nestjs/common';
import { RegulatoryReportingService } from './regulatory-reporting.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('v2/regulatory-reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RegulatoryReportingController {
  constructor(private readonly reportingService: RegulatoryReportingService) {}

  @Get('history')
  public async getHistory() {
    return this.reportingService.getReportHistory();
  }
}
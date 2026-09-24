import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SharedReportsService } from './shared-reports.service';
import { CreateSharedReportDto } from './dto/shared-report.dto';

@Controller('v2/shared-reports')
export class SharedReportsController {
  constructor(private readonly sharedReportsService: SharedReportsService) {}

  @Post()
  generate(@Body() dto: CreateSharedReportDto) {
    return this.sharedReportsService.generate(dto);
  }

  @Get()
  list(@Query('userId') userId: string) {
    return this.sharedReportsService.listForUser(userId);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    this.sharedReportsService.deactivate(id);
    return { deactivated: true };
  }

  @Patch(':id/extend')
  extend(@Param('id') id: string) {
    return this.sharedReportsService.extend(id);
  }
}

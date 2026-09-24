import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SharedReportsService } from './shared-reports.service';
import { VerifyReportDto } from './dto/shared-report.dto';

@Controller('v2/public/reports')
export class PublicReportsController {
  constructor(private readonly sharedReportsService: SharedReportsService) {}

  @Get(':shareToken')
  view(@Param('shareToken') shareToken: string) {
    return this.sharedReportsService.getPublic(shareToken);
  }

  @Post('verify')
  verify(@Body() dto: VerifyReportDto) {
    return this.sharedReportsService.verifyHash(dto.shareToken, dto.verificationHash);
  }
}

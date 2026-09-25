import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { FinancialHealthService } from './financial-health.service';

// Versioned via URI versioning (main.ts) -> served at /v2/financial-health.
// Authentication comes from the global JwtAuthGuard registered in AppModule.
@Controller({ path: 'financial-health', version: '2' })
export class FinancialHealthController {
  constructor(private readonly healthService: FinancialHealthService) {}

  @Get()
  async getHealthScore(@Req() req: any) {
    const scoreData = await this.healthService.getLatestScore(req.user.id);
    if (!scoreData) {
      // Lazy initialize metrics if no record has been created by the scheduler yet
      return this.healthService.calculateAndSaveScore(req.user.id);
    }
    return scoreData;
  }

  @Get('history')
  async getHistory(
    @Req() req: any,
    @Query('weeks', new DefaultValuePipe(12), ParseIntPipe) weeks = 12,
  ) {
    if (weeks < 1) {
      throw new BadRequestException('weeks must be a positive integer');
    }
    return this.healthService.getHistory(req.user.id, weeks);
  }
}
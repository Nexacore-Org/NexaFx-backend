import { Controller, Get, Query, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { FinancialHealthService } from './financial-health.service';

@Controller('v2/financial-health')
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
  async getHistory(@Req() req: any, @Query('weeks') weeks = 12) {
    return this.healthService.getHistory(req.user.id, Number(weeks));
  }
}
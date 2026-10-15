import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { FinancialHealthService } from './financial-health.service';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

// Versioned via URI versioning (main.ts) -> served at /v2/financial-health.
// Authentication comes from the global JwtAuthGuard registered in AppModule.
@Controller({ path: 'financial-health', version: '2' })
export class FinancialHealthController {
  constructor(private readonly healthService: FinancialHealthService) {}

  @Get()
  async getHealthScore(@CurrentUser() user: CurrentUserPayload) {
    // The JWT payload carries userId; `user.id` is undefined and makes the
    // score lookup fall back to the latest row of *any* user.
    const scoreData = await this.healthService.getLatestScore(user.userId);
    if (!scoreData) {
      // Lazy initialize metrics if no record has been created by the scheduler yet
      return this.healthService.calculateAndSaveScore(user.userId);
    }
    return scoreData;
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query('weeks', new DefaultValuePipe(12), ParseIntPipe) weeks = 12,
  ) {
    if (weeks < 1) {
      throw new BadRequestException('weeks must be a positive integer');
    }
    return this.healthService.getHistory(user.userId, weeks);
  }
}

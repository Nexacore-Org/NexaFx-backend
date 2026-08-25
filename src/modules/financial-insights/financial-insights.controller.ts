import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinancialInsightsService } from './financial-insights.service';

@ApiTags('Financial Insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'financial-insights', version: '2' })
export class FinancialInsightsController {
  constructor(private readonly insightsService: FinancialInsightsService) {}

  @Get()
  getInsights(@Req() req: { user: { id: string } }) {
    return this.insightsService.getForUser(req.user.id);
  }
}

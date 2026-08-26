import { Controller, Post, Body, UseGuards, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateAlertsEnhancementService } from './rate-alerts-enhancement.service';

@ApiTags('Rate Alerts Enhancement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v2/rate-alerts-enhancement')
export class RateAlertsEnhancementController {
  constructor(
    private readonly rateAlertsEnhancementService: RateAlertsEnhancementService,
  ) {}

  @Post('check-percent-change')
  @ApiOperation({
    summary: 'Manually trigger percentage-change alert evaluation',
    description:
      'Evaluates all active percentage-change alerts against current rates',
  })
  @ApiResponse({
    status: 200,
    description: 'Percentage-change alerts evaluated successfully',
  })
  async checkPercentChange() {
    return this.rateAlertsEnhancementService.checkPercentChangeAlerts();
  }

  @Post(':id/set-baseline')
  @ApiOperation({
    summary: 'Set baseline rate for a percent-change alert',
    description:
      'Records the current exchange rate as the baseline for percentage change calculations',
  })
  @ApiResponse({
    status: 200,
    description: 'Baseline rate set successfully',
  })
  async setBaseline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { fromCurrency: string; toCurrency: string },
  ) {
    await this.rateAlertsEnhancementService.setBaselineRate(
      id,
      body.fromCurrency,
      body.toCurrency,
    );
    return { success: true };
  }
}

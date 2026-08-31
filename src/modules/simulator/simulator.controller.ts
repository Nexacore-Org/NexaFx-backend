import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SimulatorService } from './simulator.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Simulator v2')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'simulator', version: '2' })
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Post('/target-price')
  @ApiOperation({ summary: 'Calculate projected value at a target exchange rate' })
  async targetPriceScenario(
    @Request() req: any,
    @Body() body: { targetRate: number; currency: string; toCurrency: string },
  ) {
    return this.simulatorService.targetPriceScenario(
      req.user.id,
      body.targetRate,
      body.currency,
      body.toCurrency,
    );
  }

  @Post('/backtest')
  @ApiOperation({ summary: 'Backtest an investment against historical rates' })
  async historicalBacktest(
    @Body() body: { currency: string; toCurrency: string; daysAgo: number; amount: number },
  ) {
    return this.simulatorService.historicalBacktest(
      body.currency,
      body.toCurrency,
      body.daysAgo,
      body.amount,
    );
  }

  @Post('/dca')
  @ApiOperation({ summary: 'Calculate dollar-cost averaging scenario' })
  async dcaCalculator(
    @Request() req: any,
    @Body() body: { monthlyAmount: number; currency: string; toCurrency: string; months: number },
  ) {
    return this.simulatorService.dcaCalculator(
      req.user.id,
      body.monthlyAmount,
      body.currency,
      body.toCurrency,
      body.months,
    );
  }

  @Get('/usage')
  @ApiOperation({ summary: 'Get simulator usage stats' })
  async getUsageStats() {
    return {
      totalSimulations: 0,
      uniqueUsers: 0,
      popularCurrencyPair: null,
    };
  }
}

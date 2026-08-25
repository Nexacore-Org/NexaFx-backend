import { Controller, Get, Query, ParseFloatPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { RateComparisonService } from './rate-comparison.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Exchange Rates – Comparison')
@Controller('exchange-rates')
export class RateComparisonController {
  constructor(private readonly rateComparisonService: RateComparisonService) {}

  @Public()
  @Get('compare')
  @ApiOperation({ summary: 'Compare NexaFX rate with competitor rates in real time' })
  @ApiQuery({ name: 'from', required: true, example: 'XLM' })
  @ApiQuery({ name: 'to', required: true, example: 'NGN' })
  @ApiQuery({ name: 'amount', required: true, example: '1000' })
  @ApiResponse({ status: 200, description: 'Rate comparison returned successfully' })
  async compare(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount', new DefaultValuePipe(1000), ParseFloatPipe) amount: number,
  ) {
    return this.rateComparisonService.compare(from, to, amount);
  }
}

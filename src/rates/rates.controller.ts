import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { RatesService } from './rates.service';
import { GetRateDto } from './dto/get-rate.dto';
import { GetRateResponseDto } from './dto/get-rate-response.dto';

@ApiTags('rates')
@Controller('rates')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get current FX rate, fee, and net conversion amount',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate and fee info',
    type: GetRateResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid or unsupported currency, or invalid amount',
  })
  @ApiQuery({
    name: 'source',
    required: true,
    description: 'Source currency code',
  })
  @ApiQuery({
    name: 'target',
    required: true,
    description: 'Target currency code',
  })
  @ApiQuery({
    name: 'amount',
    required: false,
    description: 'Amount in source currency',
  })
  async getRate(@Query() dto: GetRateDto): Promise<GetRateResponseDto> {
    return this.ratesService.getRate(dto);
  }
}

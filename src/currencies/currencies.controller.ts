import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiExcludeEndpoint,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { Currency } from './entities/currency.entity';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { Roles } from '../common/decorators/roles.decorators';
import { UserRole } from '../user/entities/user.entity';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditInterceptor } from 'src/audit/audit.interceptor';
import {
  SimulateConversionDto,
  ConversionSimulationResponse,
} from './dto/simulate-conversion.dto';
import { RateFetcherService } from './services/rate-fetcher.service';

@ApiTags('Currencies')
@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(
    private readonly currenciesService: CurrenciesService,
    private readonly rateFetcherService: RateFetcherService,
  ) {}

  @UseInterceptors(AuditInterceptor)
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiExcludeEndpoint()
  create(@Body() createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    return this.currenciesService.create(createCurrencyDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all supported currencies (NGN and USD)' })
  @ApiResponse({
    status: 200,
    description: 'List of supported currencies',
    type: [Currency],
  })
  findAll() {
    return this.currenciesService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a supported currency by code (NGN or USD)' })
  @ApiParam({ name: 'code', description: 'Currency code (NGN or USD)' })
  @ApiResponse({ status: 200, description: 'Currency details', type: Currency })
  findOne(@Param('code') code: string) {
    return this.currenciesService.findOne(code);
  }

  @Patch(':code')
  @Roles(UserRole.ADMIN)
  @ApiExcludeEndpoint()
  update(
    @Param('code') code: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    return this.currenciesService.update(code, updateCurrencyDto);
  }

  @Delete(':code')
  @Roles(UserRole.ADMIN)
  @ApiExcludeEndpoint()
  remove(@Param('code') code: string) {
    return this.currenciesService.remove(code);
  }

  @Post('simulate-conversion')
  @ApiOperation({ summary: 'Simulate a currency conversion between NGN and USD' })
  @ApiBody({
    type: SimulateConversionDto,
    examples: {
      default: {
        value: {
          fromCurrency: 'NGN',
          toCurrency: 'USD',
          amount: 1000,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Conversion simulation result',
    type: ConversionSimulationResponse,
  })
  async simulateConversion(
    @Body() simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    return this.currenciesService.simulateConversion(simulateConversionDto);
  }

  @Get('rates/health')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get rate fetcher service health status',
    description:
      'Returns comprehensive health information for all rate API providers including circuit breaker status, API health, and last update times',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate fetcher health status',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['healthy', 'degraded', 'unhealthy'],
          description: 'Overall health status',
        },
        apiStatus: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              isHealthy: { type: 'boolean' },
              lastCheck: { type: 'string', format: 'date-time' },
              lastSuccess: { type: 'string', format: 'date-time' },
              errorCount: { type: 'number' },
              consecutiveFailures: { type: 'number' },
            },
          },
        },
        circuitBreakers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              isOpen: { type: 'boolean' },
            },
          },
        },
        lastUpdate: { type: 'string', format: 'date-time' },
        fallbackRatesCount: { type: 'number' },
      },
    },
  })
  async getRateHealth() {
    return this.rateFetcherService.healthCheck();
  }

  @Post('rates/circuit-breaker/:provider/reset')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reset circuit breaker for a specific API provider',
    description:
      'Manually reset the circuit breaker for a rate API provider to allow requests again',
  })
  @ApiParam({
    name: 'provider',
    description:
      'API provider name (OpenExchangeRates, CoinGecko, ExchangeRateAPI)',
    enum: ['OpenExchangeRates', 'CoinGecko', 'ExchangeRateAPI'],
  })
  @ApiResponse({
    status: 200,
    description: 'Circuit breaker reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        provider: { type: 'string' },
      },
    },
  })
  resetCircuitBreaker(@Param('provider') provider: string) {
    this.rateFetcherService.resetCircuitBreaker(provider);
    return {
      message: `Circuit breaker reset successfully for ${provider}`,
      provider,
    };
  }

  @Get('rates/fallback')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get cached fallback rates',
    description:
      'Returns the cached fallback rates that can be used when primary APIs fail',
  })
  @ApiResponse({
    status: 200,
    description: 'Cached fallback rates',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          rate: { type: 'number' },
          source: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  getFallbackRates() {
    return this.rateFetcherService.getFallbackRates();
  }
}

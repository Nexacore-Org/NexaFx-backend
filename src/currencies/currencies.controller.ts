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
import { ApiTags } from '@nestjs/swagger';
import { NoneGuard } from 'src/common/guards/none.guard';

@ApiTags('currencies')
@Controller('currencies')
@UseGuards(NoneGuard)
// @UseGuards(JwtAuthGuard, RolesGuard)
// @UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

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
}

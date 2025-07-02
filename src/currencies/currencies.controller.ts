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
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { Currency } from './entities/currency.entity';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { Roles } from '../common/decorators/roles.decorators';
import { UserRole } from '../user/entities/user.entity';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditInterceptor } from 'src/audit/audit.interceptor';
import { SimulateConversionDto, ConversionSimulationResponse } from './dto/simulate-conversion.dto';

@ApiTags('Currencies')
@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @UseInterceptors(AuditInterceptor)
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new currency' })
  @ApiBody({ type: CreateCurrencyDto, examples: { default: { value: { /* fill with example fields */ } } } })
  @ApiResponse({ status: 201, description: 'Currency created', type: Currency })
  create(@Body() createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    return this.currenciesService.create(createCurrencyDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Get all currencies' })
  @ApiResponse({ status: 200, description: 'List of currencies', type: [Currency] })
  findAll() {
    return this.currenciesService.findAll();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a currency by code' })
  @ApiParam({ name: 'code', description: 'Currency code' })
  @ApiResponse({ status: 200, description: 'Currency details', type: Currency })
  findOne(@Param('code') code: string) {
    return this.currenciesService.findOne(code);
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Update a currency' })
  @ApiParam({ name: 'code', description: 'Currency code' })
  @ApiBody({ type: UpdateCurrencyDto, examples: { default: { value: { /* fill with example fields */ } } } })
  @ApiResponse({ status: 200, description: 'Currency updated', type: Currency })
  update(
    @Param('code') code: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    return this.currenciesService.update(code, updateCurrencyDto);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Delete a currency' })
  @ApiParam({ name: 'code', description: 'Currency code' })
  @ApiResponse({ status: 204, description: 'Currency deleted' })
  remove(@Param('code') code: string) {
    return this.currenciesService.remove(code);
  }

  @Post('simulate-conversion')
  @ApiOperation({ summary: 'Simulate a currency conversion' })
  @ApiBody({ type: SimulateConversionDto, examples: { default: { value: { /* fill with example fields */ } } } })
  @ApiResponse({ status: 200, description: 'Conversion simulation result', type: ConversionSimulationResponse })
  async simulateConversion(
    @Body() simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    return this.currenciesService.simulateConversion(simulateConversionDto);
  }
}

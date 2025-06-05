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
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { Currency } from './entities/currency.entity';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
feat/rates-endpoint-fx-rate-fee
import { Roles } from '../common/decorators/roles.decorators';
import { UserRole } from '../user/entities/user.entity';
import { JwtAuthGuard } from '../auth/guard/jwt.auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

import { Roles } from 'src/common/decorators/roles.decorators';
import { UserRole } from 'src/user/entities/user.entity';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { AuditInterceptor } from 'src/audit/audit.interceptor';
import { SimulateConversionDto, ConversionSimulationResponse } from './dto/simulate-conversion.dto';
main

@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @UseInterceptors(AuditInterceptor)
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    return this.currenciesService.create(createCurrencyDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  findAll() {
    return this.currenciesService.findAll();
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.currenciesService.findOne(code);
  }

  @Patch(':code')
  update(
    @Param('code') code: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    return this.currenciesService.update(code, updateCurrencyDto);
  }

  @Delete(':code')
  remove(@Param('code') code: string) {
    return this.currenciesService.remove(code);
  }

  @Post('simulate-conversion')
  async simulateConversion(
    @Body() simulateConversionDto: SimulateConversionDto,
  ): Promise<ConversionSimulationResponse> {
    return this.currenciesService.simulateConversion(simulateConversionDto);
  }
}

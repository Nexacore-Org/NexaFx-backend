// src/currency-alerts/currency-alerts.controller.ts
import { Controller, Post, Body, Get, Delete, Param, UseGuards, Request } from '@nestjs/common';
import { CurrencyAlertsService } from './currency-alerts.service';
import { CreateCurrencyAlertDto } from './dto/create-currency-alert.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('currency-alerts')
export class CurrencyAlertsController {
  constructor(private readonly alertService: CurrencyAlertsService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateCurrencyAlertDto) {
    return this.alertService.create(req.user.id, dto);
  }

  @Get('me')
  getUserAlerts(@Request() req) {
    return this.alertService.findByUser(req.user.id);
  }

  @Delete(':id')
  delete(@Request() req, @Param('id') id: string) {
    return this.alertService.delete(id, req.user.id);
  }
}

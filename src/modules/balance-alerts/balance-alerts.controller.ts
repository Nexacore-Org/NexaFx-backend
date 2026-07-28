import { Controller, Post, Delete, Body, Param } from '@nestjs/common';
import { BalanceAlertsService } from './balance-alerts.service';
import { CreateBalanceAlertDto, CheckBalanceDto } from './dto/balance-alerts.dto';

@Controller('balance-alerts')
export class BalanceAlertsController {
  constructor(private readonly alertsService: BalanceAlertsService) {}

  @Post('setup')
  setupAlert(@Body() dto: CreateBalanceAlertDto) {
    return this.alertsService.setupAlert(dto);
  }

  @Post('check')
  async checkBalance(@Body() dto: CheckBalanceDto) {
    const triggered = await this.alertsService.checkBalanceAndNotify(dto);
    return { message: 'Balance check completed', alertsTriggered: triggered.length, details: triggered };
  }

  @Delete(':id')
  deleteAlert(@Param('id') id: string) {
    return this.alertsService.deleteAlert(id);
  }
}

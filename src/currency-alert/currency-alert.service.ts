// src/currency-alerts/currency-alerts.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CurrencyAlert } from './entities/currency-alert.entity';
import { Repository } from 'typeorm';
import { CreateCurrencyAlertDto } from './dto/create-currency-alert.dto';

@Injectable()
export class CurrencyAlertsService {
  constructor(
    @InjectRepository(CurrencyAlert)
    private alertRepo: Repository<CurrencyAlert>,
  ) {}

  create(userId: string, dto: CreateCurrencyAlertDto) {
    return this.alertRepo.save({ ...dto, userId });
  }

  findByUser(userId: string) {
    return this.alertRepo.find({ where: { userId } });
  }

  delete(id: string, userId: string) {
    return this.alertRepo.delete({ id, userId });
  }

  async getPendingAlerts() {
    return this.alertRepo.find({ where: { notifiedAt: null } });
  }

  async markAsNotified(alertId: string) {
    await this.alertRepo.update(alertId, { notifiedAt: new Date() });
  }
}

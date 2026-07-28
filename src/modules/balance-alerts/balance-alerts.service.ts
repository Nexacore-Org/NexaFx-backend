import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceAlert } from './entities/balance-alert.entity';
import { CreateBalanceAlertDto, CheckBalanceDto } from './dto/balance-alerts.dto';

const COOLDOWN_MS = 3_600_000;

@Injectable()
export class BalanceAlertsService {
  constructor(
    @InjectRepository(BalanceAlert)
    private readonly alertRepo: Repository<BalanceAlert>,
  ) {}

  async setupAlert(dto: CreateBalanceAlertDto): Promise<BalanceAlert> {
    return this.alertRepo.save(this.alertRepo.create({ ...dto, lastTriggeredAt: 0 }));
  }

  async checkBalanceAndNotify(dto: CheckBalanceDto): Promise<BalanceAlert[]> {
    const alerts = await this.alertRepo.find({
      where: { walletId: dto.walletId, assetCode: dto.assetCode },
    });

    const triggered: BalanceAlert[] = [];
    const now = Date.now();

    for (const alert of alerts) {
      if (now - Number(alert.lastTriggeredAt) < COOLDOWN_MS) continue;

      const hit =
        (alert.triggerType === 'BELOW' && dto.currentBalance < alert.thresholdAmount) ||
        (alert.triggerType === 'ABOVE' && dto.currentBalance > alert.thresholdAmount);

      if (hit) {
        alert.lastTriggeredAt = now;
        await this.alertRepo.save(alert);
        this.sendNotification(alert, dto.currentBalance);
        triggered.push(alert);
      }
    }

    return triggered;
  }

  async deleteAlert(id: string): Promise<void> {
    const alert = await this.alertRepo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    await this.alertRepo.remove(alert);
  }

  private sendNotification(alert: BalanceAlert, currentBalance: number): void {
    console.log(
      `[ALERT] Sent ${alert.notificationMethod} to wallet ${alert.walletId}: Balance is ${currentBalance} (Trigger: ${alert.triggerType} ${alert.thresholdAmount})`,
    );
  }
}

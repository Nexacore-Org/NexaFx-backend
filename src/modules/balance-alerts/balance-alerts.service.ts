import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBalanceAlertDto, CheckBalanceDto } from './dto/balance-alerts.dto';

@Injectable()
export class BalanceAlertsService {
  private alerts = new Map<string, CreateBalanceAlertDto[]>();
  private lastTriggered = new Map<string, number>(); // tracking cooldowns

  /**
   * Configures a new balance alert for a user's wallet.
   */
  public setupAlert(dto: CreateBalanceAlertDto): CreateBalanceAlertDto {
    const existing = this.alerts.get(dto.walletId) || [];
    existing.push(dto);
    this.alerts.set(dto.walletId, existing);
    return dto;
  }

  /**
   * Checks the current balance against configured alerts.
   * Emits notifications if thresholds are breached and cooldowns are respected.
   */
  public checkBalanceAndNotify(dto: CheckBalanceDto) {
    const configuredAlerts = this.alerts.get(dto.walletId) || [];
    const triggered = [];

    for (const alert of configuredAlerts) {
      if (alert.assetCode !== dto.assetCode) continue;
      
      const alertKey = `${dto.walletId}-${alert.assetCode}-${alert.triggerType}`;
      const lastTime = this.lastTriggered.get(alertKey) || 0;
      const now = Date.now();
      
      // 1 hour cooldown
      if (now - lastTime < 3600000) {
        continue; 
      }

      let isTriggered = false;
      if (alert.triggerType === 'BELOW' && dto.currentBalance < alert.thresholdAmount) {
        isTriggered = true;
      } else if (alert.triggerType === 'ABOVE' && dto.currentBalance > alert.thresholdAmount) {
        isTriggered = true;
      }

      if (isTriggered) {
        triggered.push(alert);
        this.lastTriggered.set(alertKey, now);
        // Emulate sending real-time notification
        this.sendNotification(alert, dto.currentBalance);
      }
    }

    return triggered;
  }

  private sendNotification(alert: CreateBalanceAlertDto, currentBalance: number) {
    console.log(`[ALERT] Sent ${alert.notificationMethod} to wallet ${alert.walletId}: Balance is ${currentBalance} (Trigger: ${alert.triggerType} ${alert.thresholdAmount})`);
  }
}

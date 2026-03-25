import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentRailSettlementStatus, PaymentRailWebhookDto } from '../dto/payment-rail-webhook.dto';

@Injectable()
export class PaymentRailService {
  private readonly logger = new Logger(PaymentRailService.name);

  constructor(private readonly configService: ConfigService) {}

  initiateMicroDepositVerification(bankAccountId: string) {
    const reference = this.buildReference('micro');
    this.logger.log(
      `Initiated mock micro-deposit verification for bank account ${bankAccountId} with ref ${reference}`,
    );
    return { reference };
  }

  scheduleSettlement(
    transactionId: string,
    reference: string,
    onSettlement: (payload: PaymentRailWebhookDto) => Promise<void>,
  ) {
    const delayMs = this.getSettlementDelayMs();
    const status = this.getDefaultSettlementStatus();

    setTimeout(() => {
      void onSettlement({
        reference,
        status,
        failureReason:
          status === PaymentRailSettlementStatus.FAILED
            ? 'Mock payment rail settlement failure'
            : undefined,
      }).catch((error) => {
        this.logger.error(
          `Failed to apply mock settlement for transaction ${transactionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, delayMs);
  }

  buildSettlementReference(kind: 'deposit' | 'withdrawal') {
    return this.buildReference(kind);
  }

  private buildReference(prefix: string) {
    return `rail_${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  private getSettlementDelayMs() {
    const raw = this.configService.get<string>('PAYMENT_RAIL_SETTLEMENT_DELAY_MS');
    const parsed = raw ? Number(raw) : 1500;
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 1500;
    }
    return Math.floor(parsed);
  }

  private getDefaultSettlementStatus(): PaymentRailSettlementStatus {
    const raw = this.configService.get<string>('PAYMENT_RAIL_DEFAULT_SETTLEMENT_STATUS');
    return raw === PaymentRailSettlementStatus.FAILED
      ? PaymentRailSettlementStatus.FAILED
      : PaymentRailSettlementStatus.COMPLETED;
  }
}

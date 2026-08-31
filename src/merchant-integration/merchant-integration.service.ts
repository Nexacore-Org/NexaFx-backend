import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantCheckoutSession, CheckoutSessionStatus } from './entities/merchant-checkout-session.entity';
import { WebhookService } from '../webhooks/webhook.service';

@Injectable()
export class MerchantIntegrationService {
  constructor(
    @InjectRepository(MerchantCheckoutSession)
    private readonly sessionRepo: Repository<MerchantCheckoutSession>,
    private readonly webhookService: WebhookService,
  ) {}

  public async createCheckoutSession(
    merchantId: string,
    amount: number,
    currency: string,
    redirectUrl?: string,
  ): Promise<MerchantCheckoutSession> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min default

    const session = this.sessionRepo.create({
      merchantId,
      amount,
      currency,
      redirectUrl,
      expiresAt,
      status: CheckoutSessionStatus.PENDING,
    });

    return this.sessionRepo.save(session);
  }

  public async getSessionStatus(id: string): Promise<MerchantCheckoutSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Checkout session not found');
    }

    if (session.status === CheckoutSessionStatus.PENDING && new Date() > new Date(session.expiresAt)) {
      session.status = CheckoutSessionStatus.EXPIRED;
      await this.sessionRepo.save(session);
    }

    return session;
  }

  public async completeSession(id: string): Promise<MerchantCheckoutSession> {
    const session = await this.getSessionStatus(id);
    if (session.status !== CheckoutSessionStatus.PENDING) {
      throw new BadRequestException('Session is no longer pending');
    }

    session.status = CheckoutSessionStatus.PAID;
    const updated = await this.sessionRepo.save(session);

    // Dispatch via existing WebhookService
    await this.webhookService.dispatch('webhooks.completed', {
      sessionId: updated.id,
      merchantId: updated.merchantId,
      amount: updated.amount,
      currency: updated.currency,
      status: updated.status,
    });

    return updated;
  }
}
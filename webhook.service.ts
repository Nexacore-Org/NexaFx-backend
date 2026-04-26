import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, Or } from 'typeorm';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_INTERVALS = [1, 5, 30]; // minutes

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepo: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  async createEndpoint(userId: string, url: string, events: string[]): Promise<WebhookEndpoint> {
    if (!url.startsWith('https://')) {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }

    const endpoint = this.endpointRepo.create({
      userId,
      url,
      events,
      secret: crypto.randomBytes(32).toString('hex'),
      isActive: true,
    });

    return this.endpointRepo.save(endpoint);
  }

  async dispatch(eventType: string, payload: any, userId: string): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: { userId, isActive: true },
    });

    const relevantEndpoints = endpoints.filter(e => 
      e.events.includes(eventType) || e.events.includes('*')
    );

    for (const endpoint of relevantEndpoints) {
      const delivery = this.deliveryRepo.create({
        endpointId: endpoint.id,
        eventType,
        payload,
        attemptCount: 0,
      });
      await this.deliveryRepo.save(delivery);

      // Asynchronous delivery - do not await
      this.executeDelivery(delivery, endpoint).catch(err => {
        this.logger.error(`Initial delivery failed for ${endpoint.url}: ${err.message}`);
      });
    }
  }

  async executeDelivery(delivery: WebhookDelivery, endpoint: WebhookEndpoint): Promise<void> {
    const payloadString = JSON.stringify(delivery.payload);
    const signature = crypto
      .createHmac('sha256', endpoint.secret)
      .update(payloadString)
      .digest('hex');

    delivery.attemptCount++;
    
    try {
      const response = await axios.post(endpoint.url, delivery.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-NexaFX-Signature': `sha256=${signature}`,
          'User-Agent': 'NexaFX-Webhook/1.0',
        },
        timeout: 10000,
      });

      delivery.responseStatus = response.status;
      delivery.responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = null;
    } catch (error) {
      delivery.responseStatus = error.response?.status || 0;
      delivery.responseBody = error.response?.data 
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message;

      if (delivery.attemptCount < this.MAX_ATTEMPTS) {
        const delayMinutes = this.RETRY_INTERVALS[delivery.attemptCount - 1];
        delivery.nextRetryAt = new Date(Date.now() + delayMinutes * 60000);
      } else {
        delivery.nextRetryAt = null;
      }
    }

    await this.deliveryRepo.save(delivery);
  }

  async processRetries(): Promise<void> {
    const pendingDeliveries = await this.deliveryRepo.find({
      where: {
        deliveredAt: IsNull(),
        nextRetryAt: LessThan(new Date()),
      },
      take: 50,
    });

    for (const delivery of pendingDeliveries) {
      const endpoint = await this.endpointRepo.findOne({ where: { id: delivery.endpointId } });
      if (endpoint && endpoint.isActive) {
        await this.executeDelivery(delivery, endpoint);
      }
    }
  }

  async listEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    return this.endpointRepo.find({ where: { userId } });
  }

  async deleteEndpoint(userId: string, id: string): Promise<void> {
    await this.endpointRepo.delete({ id, userId });
  }

  async getDeliveryHistory(endpointId: string, userId: string): Promise<WebhookDelivery[]> {
    const endpoint = await this.endpointRepo.findOne({ where: { id: endpointId, userId } });
    if (!endpoint) {
      throw new BadRequestException('Endpoint not found');
    }
    return this.deliveryRepo.find({ where: { endpointId }, order: { createdAt: 'DESC' }, take: 100 });
  }
}
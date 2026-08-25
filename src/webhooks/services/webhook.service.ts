import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { WEBHOOK_QUEUE } from '../../modules/queues/queue.constants';
import type { WebhookDeliveryJob } from '../../modules/webhooks/webhook.processor';
import {
  buildSchemaHeaders,
  getSchemaVersionInfo,
  isDeprecatedSchemaVersion,
  WEBHOOK_SCHEMA_VERSIONS,
  WebhookSchemaTransformer,
  WebhookSchemaVersion,
} from '../../modules/webhooks/schemas';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { UpdateWebhookEndpointDto } from '../dto/update-webhook-endpoint.dto';
import * as crypto from 'crypto';
import axios from 'axios';
import { URL } from 'url';

// Private IP ranges that must never be targeted by outbound webhook requests
const BLOCKED_HOSTNAMES =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0\.0\.0\.0)/i;

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
    @InjectQueue(WEBHOOK_QUEUE)
    private readonly webhookQueue: Queue<WebhookDeliveryJob>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private validateWebhookUrl(raw: string): void {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('Webhook URL is not a valid URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }
    if (BLOCKED_HOSTNAMES.test(parsed.hostname)) {
      throw new BadRequestException('Webhook URL targets a disallowed host');
    }
  }

  private assertSupportedSchemaVersion(version: string): WebhookSchemaVersion {
    if (!WebhookSchemaTransformer.isSupportedVersion(version)) {
      throw new BadRequestException(
        `Unsupported schema version '${version}'. Supported versions: ${WEBHOOK_SCHEMA_VERSIONS.join(
          ', ',
        )}`,
      );
    }
    return version;
  }

  async createEndpoint(
    userId: string,
    url: string,
    events: string[],
    preferredSchemaVersion?: string,
  ): Promise<WebhookEndpoint> {
    this.validateWebhookUrl(url);

    const endpoint = this.endpointRepo.create({
      userId,
      url,
      events,
      secret: crypto.randomBytes(32).toString('hex'),
      isActive: true,
      // Left undefined so the column default (latest version) applies.
      ...(preferredSchemaVersion !== undefined && {
        preferredSchemaVersion:
          this.assertSupportedSchemaVersion(preferredSchemaVersion),
      }),
    });

    return this.endpointRepo.save(endpoint);
  }

  async updateEndpoint(
    userId: string,
    id: string,
    updates: UpdateWebhookEndpointDto,
  ): Promise<WebhookEndpoint> {
    const endpoint = await this.endpointRepo.findOne({ where: { id, userId } });
    if (!endpoint) {
      throw new BadRequestException('Endpoint not found');
    }

    if (updates.url !== undefined) {
      this.validateWebhookUrl(updates.url);
      endpoint.url = updates.url;
    }
    if (updates.events !== undefined) {
      endpoint.events = updates.events;
    }
    if (updates.isActive !== undefined) {
      endpoint.isActive = updates.isActive;
    }
    if (updates.preferredSchemaVersion !== undefined) {
      endpoint.preferredSchemaVersion = this.assertSupportedSchemaVersion(
        updates.preferredSchemaVersion,
      );
    }

    return this.endpointRepo.save(endpoint);
  }

  async dispatch(eventType: string, data: any, userId: string): Promise<void> {
    const endpoints = await this.endpointRepo.find({
      where: { userId, isActive: true },
    });

    const relevantEndpoints = endpoints.filter(
      (e) => e.events.includes(eventType) || e.events.includes('*'),
    );

    // One event id and timestamp shared across the fan-out, so consumers can
    // still correlate the same event across endpoints that are pinned to
    // different schema versions.
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    for (const endpoint of relevantEndpoints) {
      const payload = WebhookSchemaTransformer.transform(
        eventType,
        data,
        endpoint.preferredSchemaVersion,
        { id: eventId, timestamp },
      );

      const delivery = this.deliveryRepo.create({
        endpointId: endpoint.id,
        eventType,
        payload,
        attemptCount: 0,
      });
      await this.deliveryRepo.save(delivery);

      await this.enqueueDelivery(delivery.id, 0);
    }
  }

  async processDeliveryJob(deliveryId: string): Promise<void> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) return;

    const endpoint = await this.endpointRepo.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint || !endpoint.isActive) return;

    await this.executeDelivery(delivery, endpoint);

    if (!delivery.deliveredAt && delivery.nextRetryAt) {
      await this.enqueueDelivery(
        delivery.id,
        Math.max(0, delivery.nextRetryAt.getTime() - Date.now()),
      );
    }
  }

  async executeDelivery(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
  ): Promise<void> {
    const payloadString = JSON.stringify(delivery.payload);
    const signature = crypto
      .createHmac('sha256', endpoint.secret)
      .update(payloadString)
      .digest('hex');

    // Prefer the version the payload was actually shaped for; fall back to the
    // endpoint's preference for deliveries stored before versioning shipped.
    const schemaVersion = WebhookSchemaTransformer.resolveVersion(
      (delivery.payload as { schemaVersion?: string } | null)?.schemaVersion ??
        endpoint.preferredSchemaVersion,
    );

    if (isDeprecatedSchemaVersion(schemaVersion)) {
      this.recordDeprecatedSchemaUsage(endpoint, delivery, schemaVersion);
    }

    delivery.attemptCount++;

    try {
      // Re-validate stored URL before each delivery to guard against DB tampering
      this.validateWebhookUrl(endpoint.url);

      const response = await axios.post(endpoint.url, delivery.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-NexaFX-Signature': `sha256=${signature}`,
          'User-Agent': 'NexaFX-Webhook/1.0',
          ...buildSchemaHeaders(schemaVersion),
        },
        timeout: 10000,
        maxRedirects: 0, // prevent redirect-based SSRF
      });

      delivery.responseStatus = response.status;
      delivery.responseBody =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = null;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const response = (error as any)?.response;
      const responseData = response?.data;

      delivery.responseStatus = response?.status || 0;
      delivery.responseBody = responseData
        ? typeof responseData === 'string'
          ? responseData
          : JSON.stringify(responseData)
        : err.message;

      if (delivery.attemptCount < this.MAX_ATTEMPTS) {
        const delayMinutes = this.RETRY_INTERVALS[delivery.attemptCount - 1];
        delivery.nextRetryAt = new Date(Date.now() + delayMinutes * 60000);
      } else {
        delivery.nextRetryAt = null;
      }
    }

    await this.deliveryRepo.save(delivery);
  }

  /**
   * Records that a delivery went out on a deprecated schema version.
   *
   * Fire-and-forget: audit bookkeeping must never add latency to, or fail, a
   * webhook delivery. AuditLogsService.log already swallows its own errors.
   */
  private recordDeprecatedSchemaUsage(
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
    schemaVersion: WebhookSchemaVersion,
  ): void {
    const { deprecatedOn, sunsetOn } = getSchemaVersionInfo(schemaVersion);

    this.logger.warn(
      `Endpoint ${endpoint.id} received event ${delivery.eventType} on deprecated schema ${schemaVersion} (sunset ${sunsetOn})`,
    );

    this.auditLogsService
      .log(
        endpoint.userId ?? null,
        'webhook.deprecated_schema_used',
        'WEBHOOK_ENDPOINT',
        endpoint.id,
        'SUCCESS',
        {
          schemaVersion,
          eventType: delivery.eventType,
          deliveryId: delivery.id,
          deprecatedOn,
          sunsetOn,
        },
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to record deprecated schema audit event: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
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
      await this.enqueueDelivery(delivery.id, 0);
    }
  }

  private async enqueueDelivery(
    deliveryId: string,
    delayMs: number,
  ): Promise<void> {
    try {
      await this.webhookQueue.add(
        'deliver-webhook',
        { deliveryId },
        {
          jobId: `webhook:${deliveryId}:${delayMs}`,
          delay: delayMs,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Webhook queue unavailable; delivery ${deliveryId} will be picked up by retry cron: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async listEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    return this.endpointRepo.find({ where: { userId } });
  }

  async deleteEndpoint(userId: string, id: string): Promise<void> {
    await this.endpointRepo.delete({ id, userId });
  }

  async getDeliveryHistory(
    endpointId: string,
    userId: string,
  ): Promise<WebhookDelivery[]> {
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) {
      throw new BadRequestException('Endpoint not found');
    }
    return this.deliveryRepo.find({
      where: { endpointId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async testEndpoint(endpointId: string, userId: string): Promise<void> {
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) {
      throw new BadRequestException('Endpoint not found');
    }

    const payload = WebhookSchemaTransformer.transform(
      'ping',
      { message: 'Test ping from NexaFX' },
      endpoint.preferredSchemaVersion,
    );

    const delivery = this.deliveryRepo.create({
      endpointId: endpoint.id,
      eventType: 'ping',
      payload,
      attemptCount: 0,
    });
    await this.deliveryRepo.save(delivery);

    this.executeDelivery(delivery, endpoint).catch((err) => {
      this.logger.error(`Test delivery failed: ${err.message}`);
    });
  }

  async redeliver(
    endpointId: string,
    deliveryId: string,
    userId: string,
  ): Promise<void> {
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });
    if (!endpoint) {
      throw new BadRequestException('Endpoint not found');
    }

    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId, endpointId },
    });
    if (!delivery) {
      throw new BadRequestException('Delivery not found');
    }

    this.executeDelivery(delivery, endpoint).catch((err) => {
      this.logger.error(`Redelivery failed: ${err.message}`);
    });
  }
}

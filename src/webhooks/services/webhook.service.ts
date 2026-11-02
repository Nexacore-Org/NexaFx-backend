import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as ipaddr from 'ipaddr.js';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { WEBHOOK_QUEUE } from '../../modules/queues/queue.constants';
import {
  buildSchemaHeaders,
  isDeprecatedSchemaVersion,
  isSupportedSchemaVersion,
  resolveSchemaVersion,
  WebhookSchemaTransformer,
  WebhookSchemaVersion,
} from '../../modules/webhooks/schemas';

const BLOCKED_HOSTNAMES = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i;

const SECRET_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Ranges that must never be reachable from the webhook worker.
 * Covers loopback, private, link-local, CGNAT, unique-local, multicast and
 * unspecified addresses for both IPv4 and IPv6 (including IPv4-mapped IPv6).
 */
const BLOCKED_IP_RANGES = [
  'unspecified',
  'broadcast',
  'multicast',
  'linkLocal',
  'loopback',
  'private',
  'carrierGradeNat',
  'uniqueLocal',
  'reserved',
];

/**
 * Relation keys that must never be serialised into an outbound webhook body.
 * Reconciliation loads transactions with `relations: ['user']`, and the frozen
 * v1 builder is a shallow spread, so nested entities (and their credential
 * columns) would otherwise leak to third-party URLs and into
 * webhook_deliveries.payload.
 */
const STRIPPED_RELATION_KEYS = [
  'user',
  'category',
  'account',
  'wallet',
  'budget',
  'tags',
  'attachments',
  'transactions',
];

/**
 * Sensitive scalar columns that must never appear in a webhook payload even if
 * a caller passes a flattened object. Kept in sync with User entity columns.
 */
const SENSITIVE_PAYLOAD_KEYS = [
  'password',
  'passwordHash',
  'walletSecretKeyEncrypted',
  'walletSecretKey',
  'twoFactorSecret',
  'twoFactorRecoveryCodes',
  'refreshTokenHash',
  'phone',
  'balances',
];

/**
 * Produces a plain-object snapshot of a transaction (or any entity) that is
 * safe to hand to a schema transformer: relation objects are dropped and
 * sensitive scalar columns are removed. Only own enumerable properties are
 * copied, so class prototypes and getters are not serialised.
 */
export function toSafeWebhookSnapshot(data: any): any {
  if (data === null || typeof data !== 'object') {
    return data;
  }

  const snapshot: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    if (STRIPPED_RELATION_KEYS.includes(key)) {
      continue;
    }
    if (SENSITIVE_PAYLOAD_KEYS.includes(key)) {
      continue;
    }
    const value = data[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date)
    ) {
      // Drop any remaining nested object/array (unloaded or unexpected
      // relations) rather than risk serialising credential material.
      continue;
    }
    snapshot[key] = value;
  }

  return snapshot;
}

function isBlockedAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (
      parsed.kind() === 'ipv6' &&
      (parsed as ipaddr.IPv6).isIPv4MappedAddress()
    ) {
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    }
    return BLOCKED_IP_RANGES.includes(parsed.range());
  } catch {
    // Unparseable addresses are treated as unsafe.
    return true;
  }
}

/**
 * Builds an http(s).Agent whose `lookup` validates every resolved address
 * before it is used for the connection. This pins the validated IP to the
 * actual socket, preventing DNS rebinding between validation and connect.
 */
function createSsrfSafeAgent(): { http: http.Agent; https: https.Agent } {
  const lookup: http.AgentOptions['lookup'] = (hostname, options, callback) => {
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) {
        return callback(err, '', 0);
      }
      const list = Array.isArray(addresses) ? addresses : [addresses];
      for (const entry of list) {
        if (isBlockedAddress(entry.address)) {
          return callback(
            new Error(`Blocked address resolved for host ${hostname}`),
            '',
            0,
          );
        }
      }
      const first = list[0];
      if (!first) {
        return callback(
          new Error(`No address resolved for host ${hostname}`),
          '',
          0,
        );
      }
      return callback(null, first.address, first.family);
    });
  };

  return {
    http: new http.Agent({ lookup }),
    https: new https.Agent({ lookup }),
  };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepo: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Guards every public method against an undefined/empty userId. Without this
   * TypeORM 0.3 silently drops the undefined key from where-objects, turning
   * owner-scoped queries into cross-tenant lookups.
   */
  private assertUserId(userId: string): void {
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      throw new UnauthorizedException('Authenticated user is required');
    }
  }

  private async validateWebhookUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid webhook URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook URL must use HTTPS');
    }

    // Node keeps the brackets on IPv6 hosts (e.g. "[::1]").
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

    if (BLOCKED_HOSTNAMES.test(hostname)) {
      throw new BadRequestException('Webhook URL points to a blocked host');
    }

    // If the host is already an IP literal, validate it directly.
    if (ipaddr.isValid(hostname)) {
      if (isBlockedAddress(hostname)) {
        throw new BadRequestException(
          'Webhook URL points to a blocked address',
        );
      }
      return;
    }

    // Otherwise resolve the hostname and reject if any address is unsafe.
    const addresses = await new Promise<dns.LookupAddress[]>(
      (resolve, reject) => {
        dns.lookup(hostname, { all: true }, (err, result) => {
          if (err) {
            return reject(
              new BadRequestException('Webhook URL host could not be resolved'),
            );
          }
          resolve(Array.isArray(result) ? result : [result]);
        });
      },
    );

    if (addresses.length === 0) {
      throw new BadRequestException('Webhook URL host could not be resolved');
    }

    for (const entry of addresses) {
      if (isBlockedAddress(entry.address)) {
        throw new BadRequestException(
          'Webhook URL points to a blocked address',
        );
      }
    }
  }

  async createEndpoint(
    userId: string,
    url: string,
    events: string[],
    preferredSchemaVersion?: string,
  ): Promise<WebhookEndpoint> {
    this.assertUserId(userId);
    await this.validateWebhookUrl(url);

    if (
      preferredSchemaVersion !== undefined &&
      !isSupportedSchemaVersion(preferredSchemaVersion)
    ) {
      throw new BadRequestException('Unsupported schema version');
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const endpoint = this.endpointRepo.create({
      userId,
      url,
      events,
      secret,
      isActive: true,
      ...(preferredSchemaVersion !== undefined
        ? {
            preferredSchemaVersion:
              preferredSchemaVersion as WebhookSchemaVersion,
          }
        : {}),
    });

    return this.endpointRepo.save(endpoint);
  }

  async listEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    this.assertUserId(userId);
    return this.endpointRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateEndpoint(
    userId: string,
    endpointId: string,
    updates: Partial<WebhookEndpoint>,
  ): Promise<WebhookEndpoint> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    if (updates.url !== undefined) {
      await this.validateWebhookUrl(updates.url);
    }

    if (
      updates.preferredSchemaVersion !== undefined &&
      !isSupportedSchemaVersion(updates.preferredSchemaVersion)
    ) {
      throw new BadRequestException('Unsupported schema version');
    }

    Object.assign(endpoint, updates);
    return this.endpointRepo.save(endpoint);
  }

  async deleteEndpoint(userId: string, endpointId: string): Promise<void> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    await this.endpointRepo.delete({ id: endpoint.id, userId });
  }

  /**
   * Rotates the signing secret for an endpoint. The new secret is returned
   * exactly once; the previous secret is retained so in-flight consumers can
   * still verify deliveries during the grace window.
   */
  async rotateSecret(
    userId: string,
    endpointId: string,
  ): Promise<{ secret: string }> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const secret = crypto.randomBytes(32).toString('hex');
    endpoint.previousSecret = endpoint.secret;
    endpoint.previousSecretExpiresAt = new Date(
      Date.now() + SECRET_ROTATION_GRACE_MS,
    );
    endpoint.secret = secret;

    await this.endpointRepo.save(endpoint);

    return { secret };
  }

  async getDeliveryHistory(
    endpointId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: WebhookDelivery[];
    total: number;
    page: number;
    limit: number;
  }> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    if (typeof this.deliveryRepo.findAndCount === 'function') {
      const [data, total] = await this.deliveryRepo.findAndCount({
        where: { endpointId: endpoint.id },
        order: { createdAt: 'DESC' },
        skip,
        take: safeLimit,
      });
      return { data, total, page: safePage, limit: safeLimit };
    }

    const items =
      (await this.deliveryRepo.find({
        where: { endpointId: endpoint.id },
        order: { createdAt: 'DESC' },
        skip,
        take: safeLimit,
      })) ?? [];

    return {
      data: items,
      total: items.length,
      page: safePage,
      limit: safeLimit,
    };
  }

  async executeDelivery(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
  ): Promise<WebhookDelivery> {
    const schemaVersion = resolveSchemaVersion(
      delivery.payload?.schemaVersion ?? endpoint.preferredSchemaVersion,
    );

    if (isDeprecatedSchemaVersion(schemaVersion)) {
      try {
        await this.auditLogsService.log(
          endpoint.userId,
          'webhook.deprecated_schema_used',
          'WEBHOOK_ENDPOINT',
          endpoint.id,
          'SUCCESS',
          {
            schemaVersion,
            eventType: delivery.eventType,
            deliveryId: delivery.id,
          },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to write deprecated schema audit log for endpoint ${endpoint.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const bodyString = JSON.stringify(delivery.payload ?? {});
    const signature = crypto
      .createHmac('sha256', endpoint.secret ?? '')
      .update(bodyString)
      .digest('hex');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NexaFX-Signature': signature,
      'X-NexaFX-Event': delivery.eventType,
      ...buildSchemaHeaders(schemaVersion),
    };

    const agents = createSsrfSafeAgent();
    const response = await axios.post(endpoint.url, delivery.payload, {
      headers,
      timeout: 10000,
      httpAgent: agents.http,
      httpsAgent: agents.https,
    });

    delivery.attemptCount = (delivery.attemptCount ?? 0) + 1;
    delivery.responseStatus = response.status;
    delivery.responseBody =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);
    delivery.deliveredAt = new Date();

    return this.deliveryRepo.save(delivery);
  }

  async testEndpoint(
    endpointId: string,
    userId: string,
  ): Promise<WebhookDelivery> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const schemaVersion = resolveSchemaVersion(endpoint.preferredSchemaVersion);
    const payload = {
      id: crypto.randomUUID(),
      event: 'ping',
      schemaVersion,
      timestamp: new Date().toISOString(),
      data: { message: 'NexaFX webhook test ping' },
    };

    const delivery = this.deliveryRepo.create({
      endpointId: endpoint.id,
      eventType: 'ping',
      payload,
      attemptCount: 0,
    });

    const saved = await this.deliveryRepo.save(delivery);
    return this.executeDelivery(saved, endpoint);
  }

  async redeliver(
    endpointId: string,
    deliveryId: string,
    userId: string,
  ): Promise<WebhookDelivery> {
    this.assertUserId(userId);
    const endpoint = await this.endpointRepo.findOne({
      where: { id: endpointId, userId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId, endpointId: endpoint.id },
    });

    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }

    return this.executeDelivery(delivery, endpoint);
  }

  async processDeliveryJob(deliveryId: string): Promise<void> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      return;
    }

    const endpoint = await this.endpointRepo.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint || !endpoint.isActive) {
      return;
    }

    await this.executeDelivery(delivery, endpoint);
  }

  async dispatch(
    event: string,
    rawTransaction: any,
    userId: string,
  ): Promise<void> {
    this.assertUserId(userId);
    const endpoints = await this.endpointRepo.find({
      where: { userId, isActive: true },
    });

    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Snapshot the entity into a plain object before it reaches any schema
    // transformer. This strips loaded relations (e.g. `user`) and sensitive
    // scalar columns so credential material can never be serialised into the
    // outbound body or persisted in webhook_deliveries.payload.
    const transaction = toSafeWebhookSnapshot(rawTransaction);

    for (const endpoint of endpoints) {
      if (!endpoint.events.includes('*') && !endpoint.events.includes(event)) {
        continue;
      }

      const payload = WebhookSchemaTransformer.transform(
        event,
        transaction,
        endpoint.preferredSchemaVersion,
        {
          id: eventId,
          timestamp,
        },
      );

      const delivery = this.deliveryRepo.create({
        endpointId: endpoint.id,
        eventType: event,
        payload,
        attemptCount: 0,
      });

      const savedDelivery = await this.deliveryRepo.save(delivery);

      await this.webhookQueue.add(
        'deliver',
        {
          deliveryId: savedDelivery.id,
          endpointId: endpoint.id,
          url: endpoint.url,
          secret: endpoint.secret,
          payload,
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }
  }
}

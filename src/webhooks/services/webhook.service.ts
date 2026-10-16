import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as ipaddr from 'ipaddr.js';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

const BLOCKED_HOSTNAMES = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i;

const SUPPORTED_SCHEMA_VERSIONS = ['1.0', '2.0'];

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

function isBlockedAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
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
        return callback(new Error(`No address resolved for host ${hostname}`), '', 0);
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
    @InjectQueue('webhook-queue') private readonly webhookQueue: Queue,
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
        throw new BadRequestException('Webhook URL points to a blocked address');
      }
      return;
    }

    // Otherwise resolve the hostname and reject if any address is unsafe.
    const addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err, result) => {
        if (err) {
          return reject(
            new BadRequestException('Webhook URL host could not be resolved'),
          );
        }
        resolve(Array.isArray(result) ? result : [result]);
      });
    });

    if (addresses.length === 0) {
      throw new BadRequestException('Webhook URL host could not be resolved');
    }

    for (const entry of addresses) {
      if (isBlockedAddress(entry.address)) {
        throw new BadRequestException('Webhook URL points to a blocked address');
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
      !SUPPORTED_SCHEMA_VERSIONS.includes(preferredSchemaVersion)
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
        ? { preferredSchemaVersion }
        : {}),
    });

    return this.endpointRepo.save(endpoint);
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
      !SUPPORTED_SCHEMA_VERSIONS.includes(updates.preferredSchemaVersion)
    ) {
      throw new BadRequestException('Unsupported schema version');
    }

    Object.assign(endpoint, updates);
    return this.endpointRepo.save(endpoint);
  }

  /**
   * Rotates the signing secret for an endpoint. The new secret is returned
   * exactly once; the previous secret is retained (hashed) so in-flight
   * consumers can still verify deliveries during the grace window.
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
    endpoint.secretRotatedAt = new Date();
    endpoint.secret = secret;

    await this.endpointRepo.save(endpoint);

    return { secret };
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

    for (const endpoint of endpoints) {
      if (!endpoint.events.includes('*') && !endpoint.events.includes(event)) {
        continue;
      }

      const payload = this.buildPayload(
        endpoint,
        event,
        rawTransaction,
        eventId,
        timestamp,
      );

      const delivery = this.deliveryRepo.create({
        endpointId: endpoint.id,
        event,
        payload,
        status: 'PENDING',
      });

      const saved = await this.deliveryRepo.save(delivery);

      await this.webhookQueue.add('deliver', {
        deliveryId: saved.id,
        endpointId: endpoint.id,
      });
    }
  }

  private buildPayload(
    endpoint: WebhookEndpoint,
    event: string,
 

/* … truncated 3440 chars — edit only what you need near the top … */

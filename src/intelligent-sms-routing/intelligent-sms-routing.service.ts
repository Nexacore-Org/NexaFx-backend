import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsProviderRoute } from './entities/sms-provider-route.entity';

/**
 * Adapter contract for a real SMS provider. Implementations must throw on
 * failure so the router can fail over to the next route.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<void>;
}

/**
 * Twilio adapter driven by env credentials.
 */
class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: this.from, Body: body });
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      'base64',
    );
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Twilio responded with status ${res.status}`);
    }
  }
}

/**
 * Termii adapter driven by env credentials.
 */
class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        to,
        from: this.from,
        sms: body,
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (!res.ok) {
      throw new Error(`Termii responded with status ${res.status}`);
    }
  }
}

/**
 * Infobip adapter driven by env credentials.
 */
class InfobipSmsProvider implements SmsProvider {
  readonly name = 'infobip';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ destinations: [{ to }], from: this.from, text: body }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Infobip responded with status ${res.status}`);
    }
  }
}

/**
 * Mock adapter used only when SMS_PROVIDER=mock (never in production).
 */
class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  constructor(private readonly logger: Logger) {}

  async send(to: string, body: string): Promise<void> {
    this.logger.log(
      `[SMS-MOCK] Sending to ${maskPhone(to)} (body length ${body.length})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Mask a phone number for logging, keeping only the last 2 digits.
 */
function maskPhone(phone: string): string {
  if (phone.length <= 2) return '***';
  return `${'*'.repeat(phone.length - 2)}${phone.slice(-2)}`;
}

const FAILURE_THRESHOLD = 3;
const COOL_DOWN_MS = 60_000;

@Injectable()
export class IntelligentSmsRoutingService {
  private readonly logger = new Logger(IntelligentSmsRoutingService.name);
  private providerHealth: Record<string, boolean> = {
    twilio: true,
    infobip: true,
    messagebird: true,
  };
  private readonly failureCounts: Record<string, number> = {};
  private readonly unhealthyUntil: Record<string, number> = {};
  private readonly providers: Record<string, SmsProvider> = {};

  constructor(
    @InjectRepository(SmsProviderRoute)
    private readonly routeRepository: Repository<SmsProviderRoute>,
  ) {
    this.registerProviders();
  }

  /**
   * Build the provider registry from env credentials. In production a real
   * provider must be configured; otherwise fail fast at startup.
   */
  private registerProviders(): void {
    const selected = (process.env.SMS_PROVIDER || '').toLowerCase();
    const isProduction = process.env.NODE_ENV === 'production';

    if (selected === 'mock') {
      if (isProduction) {
        throw new Error(
          'SMS_PROVIDER=mock is not allowed in production; configure a real SMS provider',
        );
      }
      this.providers.mock = new MockSmsProvider(this.logger);
      return;
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.providers.twilio = new TwilioSmsProvider(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
        process.env.TWILIO_FROM_NUMBER || '',
      );
    }
    if (process.env.TERMII_API_KEY) {
      this.providers.termii = new TermiiSmsProvider(
        process.env.TERMII_API_KEY,
        process.env.TERMII_FROM || '',
      );
    }
    if (process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL) {
      this.providers.infobip = new InfobipSmsProvider(
        process.env.INFOBIP_BASE_URL,
        process.env.INFOBIP_API_KEY,
        process.env.INFOBIP_FROM || '',
      );
    }

    if (Object.keys(this.providers).length === 0) {
      if (isProduction) {
        throw new Error(
          'No SMS provider configured in production; set SMS_PROVIDER and provider credentials',
        );
      }
      this.providers.mock = new MockSmsProvider(this.logger);
    }
  }

  /**
   * Set provider health for testing failover/fallback scenarios.
   */
  setProviderHealth(providerName: string, healthy: boolean): void {
    const key = providerName.toLowerCase();
    this.providerHealth[key] = healthy;
    if (healthy) {
      this.failureCounts[key] = 0;
      delete this.unhealthyUntil[key];
    } else {
      this.unhealthyUntil[key] = Date.now() + COOL_DOWN_MS;
    }
  }

  /**
   * Routes and sends SMS via the best active provider.
   */
  async sendSms(to: string, message: string): Promise<void> {
    const cleanTo = to.trim();
    if (!cleanTo.startsWith('+')) {
      throw new BadRequestException(
        'Phone number must start with "+" and include country code',
      );
    }

    const matchedRoutes = await this.resolveRoutesForPhone(cleanTo);
    if (matchedRoutes.length === 0) {
      throw new BadRequestException(
        `No SMS provider routes found for destination ${maskPhone(cleanTo)}`,
      );
    }

    const errors: string[] = [];
    for (const route of matchedRoutes) {
      const provider = route.providerName.toLowerCase();
      if (!this.isProviderHealthy(provider)) {
        errors.push(`${provider}: provider unhealthy (cool-down)`);
        continue;
      }
      const adapter = this.providers[provider];
      if (!adapter) {
        errors.push(`${provider}: no adapter configured`);
        continue;
      }
      try {
        await adapter.send(cleanTo, message);
        this.recordSuccess(provider);
        this.logger.log(
          `[SMS] Delivered successfully via ${provider} to ${maskPhone(cleanTo)}`,
        );
        return; // Success!
      } catch (err: any) {
        this.recordFailure(provider);
        this.logger.warn(
          `[SMS] Failed to send via ${provider} to ${maskPhone(cleanTo)}: ${err.message}`,
        );
        errors.push(`${provider}: ${err.message}`);
      }
    }

    throw new Error(
      `All SMS providers failed to deliver to ${maskPhone(cleanTo)}. Details: ${errors.join(', ')}`,
    );
  }

  // ─── CRUD Rule Endpoints ──────────────────────────────────────────────────

  async createRoute(dto: Partial<SmsProviderRoute>): Promise<SmsProviderRoute> {
    const route = this.routeRepository.create(dto);
    return this.routeRepository.save(route);
  }

  async getRoutes(): Promise<SmsProviderRoute[]> {
    return this.routeRepository.find({
      order: { countryCode: 'ASC', priority: 'ASC' },
    });
  }

  async updateRoute(
    id: string,
    dto: Partial<SmsProviderRoute>,
  ): Promise<SmsProviderRoute> {
    const route = await this.routeRepository.findOne({ where: { id } });
    if (!route) throw new NotFoundException('SMS Route not found');
    Object.assign(route, dto);
    return this.routeRepository.save(route);
  }

  async deleteRoute(id: string): Promise<void> {
    const result = await this.routeRepository.delete(id);
    if (result.affected === 0)
      throw new NotFoundException('SMS Route not found');
  }

  // ─── Helper Functions ─────────────────────────────────────────────────────

  private isProviderHealthy(provider: string): boolean {
    if (this.providerHealth[provider] === false) return false;
    const until = this.unhealthyUntil[provider];
    if (until && Date.now() < until) return false;
    if (until && Date.now() >= until) {
      // Cool-down elapsed: allow a retry.
      delete this.unhealthyUntil[provider];
      this.failureCounts[provider] = 0;
    }
    return true;
  }

  private recordSuccess(provider: string): void {
    this.failureCounts[provider] = 0;
    delete this.unhealthyUntil[provider];
    this.providerHealth[provider] = true;
  }

  private recordFailure(provider: string): void {
    const count = (this.failureCounts[provider] || 0) + 1;
    this.failureCounts[provider] = count;
    if (count >= FAILURE_THRESHOLD) {
      this.unhealthyUntil[provider] = Date.now() + COOL_DOWN_MS;
      this.logger.warn(
        `[SMS] Provider ${provider} marked unhealthy after ${count} consecutive failures`,
      );
    }
  }

  private async resolveRoutesForPhone(
    phone: string,
  ): Promise<SmsProviderRoute[]> {
    // Try matching prefixes from 4 digits down to 1 (e.g. +2348, +234, +23, +2)
    const prefixes: string[] = [];
    for (let i = 5; i >= 2; i--) {
      if (phone.length >= i) {
        prefixes.push(phone.substring(0, i));
      }
    }

    let routes: SmsProviderRoute[] = [];
    for (const prefix of prefixes) {
      routes = await this.routeRepository.find({
        where: { countryCode: prefix, isActive: true },
        order: { priority: 'ASC' },
      });
      if (routes.length > 0) break;
    }

    if (routes.length === 0) {
      // Fallback to default
      routes = await this.routeRepository.find({
        where: { countryCode: 'default', isActive: true },
        order: { priority: 'ASC' },
      });
    }

    return routes;
  }
}

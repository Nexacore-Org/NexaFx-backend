import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsProviderRoute } from './entities/sms-provider-route.entity';

@Injectable()
export class IntelligentSmsRoutingService {
  private readonly logger = new Logger(IntelligentSmsRoutingService.name);
  private providerHealth: Record<string, boolean> = {
    twilio: true,
    infobip: true,
    messagebird: true,
  };

  constructor(
    @InjectRepository(SmsProviderRoute)
    private readonly routeRepository: Repository<SmsProviderRoute>,
  ) {}

  /**
   * Set provider health for testing failover/fallback scenarios.
   */
  setProviderHealth(providerName: string, healthy: boolean): void {
    this.providerHealth[providerName.toLowerCase()] = healthy;
  }

  /**
   * Routes and sends SMS via the best active provider.
   */
  async sendSms(to: string, message: string): Promise<void> {
    const cleanTo = to.trim();
    if (!cleanTo.startsWith('+')) {
      throw new BadRequestException('Phone number must start with "+" and include country code');
    }

    const matchedRoutes = await this.resolveRoutesForPhone(cleanTo);
    if (matchedRoutes.length === 0) {
      throw new BadRequestException(`No SMS provider routes found for destination ${cleanTo}`);
    }

    const errors: string[] = [];
    for (const route of matchedRoutes) {
      const provider = route.providerName.toLowerCase();
      try {
        if (!this.providerHealth[provider]) {
          throw new Error(`Simulated outage for provider ${provider}`);
        }
        await this.deliverSmsWithMock(provider, cleanTo, message);
        this.logger.log(`[SMS] Delivered successfully via ${provider} to ${cleanTo}`);
        return; // Success!
      } catch (err: any) {
        this.logger.warn(`[SMS] Failed to send via ${provider}: ${err.message}`);
        errors.push(`${provider}: ${err.message}`);
      }
    }

    throw new Error(`All SMS providers failed to deliver to ${cleanTo}. Details: ${errors.join(', ')}`);
  }

  // ─── CRUD Rule Endpoints ──────────────────────────────────────────────────

  async createRoute(dto: Partial<SmsProviderRoute>): Promise<SmsProviderRoute> {
    const route = this.routeRepository.create(dto);
    return this.routeRepository.save(route);
  }

  async getRoutes(): Promise<SmsProviderRoute[]> {
    return this.routeRepository.find({ order: { countryCode: 'ASC', priority: 'ASC' } });
  }

  async updateRoute(id: string, dto: Partial<SmsProviderRoute>): Promise<SmsProviderRoute> {
    const route = await this.routeRepository.findOne({ where: { id } });
    if (!route) throw new NotFoundException('SMS Route not found');
    Object.assign(route, dto);
    return this.routeRepository.save(route);
  }

  async deleteRoute(id: string): Promise<void> {
    const result = await this.routeRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('SMS Route not found');
  }

  // ─── Helper Functions ─────────────────────────────────────────────────────

  private async resolveRoutesForPhone(phone: string): Promise<SmsProviderRoute[]> {
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

  private async deliverSmsWithMock(provider: string, to: string, message: string): Promise<void> {
    this.logger.log(`[SMS-MOCK] Sending to ${to} via ${provider}: ${message}`);
    // Simulate slight network latency
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

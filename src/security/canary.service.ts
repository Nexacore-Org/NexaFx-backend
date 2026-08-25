import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanaryToken, CanaryType } from '../entities/canary-token.entity';
import { AlertService } from './alert.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CanaryService {
  private readonly logger = new Logger(CanaryService.name);

  constructor(
    @InjectRepository(CanaryToken)
    private readonly canaryRepo: Repository<CanaryToken>,
    private readonly alertService: AlertService,
  ) {}

  /**
   * Generates a new field inject canary or export token reference dynamically.
   */
  async registerDynamicCanary(type: CanaryType, template: 'email' | 'reference'): Promise<string> {
    const id = uuidv4();
    const tokenStr = template === 'email' ? `canary-${id}@nexafx-trap.com` : `CANARY-${id.slice(0,8).toUpperCase()}`;

    const newCanary = this.canaryRepo.create({
      type,
      token: tokenStr,
      description: `Automated dynamic honeytoken footprint for tracking exfiltration vectors.`,
    });
    
    await this.canaryRepo.save(newCanary);
    return tokenStr;
  }

  /**
   * Scans an incoming string or payload property parameter block to match active trap footprints.
   */
  async checkStringForCanaryTokens(input: string, contextSource: string): Promise<void> {
    if (!input) return;

    // Fast-path lookup scanning string arrays for token components
    const matchedToken = await this.canaryRepo.findOne({
      where: { token: input.trim(), isTriggered: false },
    });

    if (matchedToken) {
      await this.triggerCanaryAlert(matchedToken, contextSource);
    }
  }

  /**
   * Triages security breach sequences instantly and notifies administrators.
   */
  async triggerCanaryAlert(canary: CanaryToken, source: string): Promise<void> {
    canary.isTriggered = true;
    canary.triggeredAt = new Date();
    canary.triggeredBy = source;
    await this.canaryRepo.save(canary);

    this.logger.error(`CRITICAL SECURITY BREACH: Canary Token of type [${canary.type}] tripped by footprint vector: ${source}`);

    // Fire out-of-band alerts instantly across app channels
    await this.alertService.dispatchSuperAdminExfiltrationEmergency(canary, source);
  }
}
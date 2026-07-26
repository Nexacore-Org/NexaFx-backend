import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContentModerationEvent,
  ModerationAction,
} from './entities/content-moderation-event.entity';
import { RedisService } from '../redis/redis.service';

export interface ModerationResult {
  allowed: boolean;
  flags: string[];
  cleaned: string;
  action: ModerationAction;
}

const MAX_LENGTHS: Record<string, number> = {
  memo: 200,
  note: 1000,
  message: 5000,
  description: 5000,
  body: 5000,
};

const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN_RE = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;
const URL_RE = /https?:\/\/[^\s]+/gi;
const INJECTION_RE = /<script[\s>]|javascript:|on\w+\s*=|eval\(|document\.(cookie|write)/gi;

const BLOCKLIST_KEY = 'nexafx:moderation:blocklist';
const DEFAULT_BLOCKLIST = [
  'shit',
  'fuck',
  'damn',
  'ass',
  'bitch',
  'bastard',
  'crap',
  'piss',
  'dick',
  'cock',
  'asshole',
  'motherfucker',
  'slut',
  'whore',
];

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(
    @InjectRepository(ContentModerationEvent)
    private readonly eventRepository: Repository<ContentModerationEvent>,
    private readonly redisService: RedisService,
  ) {}

  async moderate(
    text: string,
    context: string,
    userId: string,
  ): Promise<ModerationResult> {
    const maxLength = MAX_LENGTHS[context] ?? 5000;

    if (text.length > maxLength) {
      return {
        allowed: false,
        flags: ['LENGTH_EXCEEDED'],
        cleaned: text,
        action: ModerationAction.REJECTED,
      };
    }

    const piiFlags = this.detectPII(text);
    if (piiFlags.length > 0) {
      await this.logEvent(userId, context, text, piiFlags, ModerationAction.REJECTED);
      return {
        allowed: false,
        flags: piiFlags,
        cleaned: text,
        action: ModerationAction.REJECTED,
      };
    }

    const { cleaned: profanityCleaned, flags: profanityFlags } =
      await this.checkProfanity(text);

    const suspiciousFlags = this.detectSuspiciousPatterns(text);
    const allFlags = [...profanityFlags, ...suspiciousFlags];

    if (allFlags.length === 0) {
      return {
        allowed: true,
        flags: [],
        cleaned: text,
        action: ModerationAction.ALLOWED,
      };
    }

    if (suspiciousFlags.length > 0 && profanityFlags.length === 0) {
      await this.logEvent(
        userId,
        context,
        text,
        allFlags,
        ModerationAction.FLAGGED_FOR_REVIEW,
      );
      return {
        allowed: true,
        flags: allFlags,
        cleaned: text,
        action: ModerationAction.FLAGGED_FOR_REVIEW,
      };
    }

    if (profanityFlags.length > 0) {
      await this.logEvent(
        userId,
        context,
        null,
        allFlags,
        ModerationAction.STRIPPED,
      );
      return {
        allowed: true,
        flags: allFlags,
        cleaned: profanityCleaned,
        action: ModerationAction.STRIPPED,
      };
    }

    return {
      allowed: true,
      flags: allFlags,
      cleaned: text,
      action: ModerationAction.ALLOWED,
    };
  }

  async addToBlocklist(word: string): Promise<void> {
    await this.redisService.rawClient.sadd(
      BLOCKLIST_KEY,
      word.toLowerCase(),
    );
  }

  async removeFromBlocklist(word: string): Promise<void> {
    await this.redisService.rawClient.srem(
      BLOCKLIST_KEY,
      word.toLowerCase(),
    );
  }

  async getBlocklist(): Promise<string[]> {
    const members = await this.redisService.rawClient.smembers(BLOCKLIST_KEY);
    if (members.length === 0) {
      await this.redisService.rawClient.sadd(
        BLOCKLIST_KEY,
        ...DEFAULT_BLOCKLIST,
      );
      return [...DEFAULT_BLOCKLIST];
    }
    return members.sort();
  }

  async getFlaggedEvents(
    action?: ModerationAction,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ events: ContentModerationEvent[]; total: number }> {
    const qb = this.eventRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.user', 'user');

    if (action) {
      qb.where('e.action = :action', { action });
    } else {
      qb.where('e.action != :allowed', {
        allowed: ModerationAction.ALLOWED,
      });
    }

    qb.orderBy('e.createdAt', 'DESC');

    const total = await qb.getCount();
    const events = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { events, total };
  }

  private async checkProfanity(
    text: string,
  ): Promise<{ cleaned: string; flags: string[] }> {
    const blocklist = await this.getBlocklist();
    const lowerText = text.toLowerCase();
    const flags: string[] = [];
    let cleaned = text;

    for (const word of blocklist) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
      if (regex.test(lowerText)) {
        flags.push(`PROFANITY:${word.toUpperCase()}`);
        cleaned = cleaned.replace(regex, '***');
      }
    }

    return { cleaned, flags };
  }

  private detectPII(text: string): string[] {
    const flags: string[] = [];

    if (this.luhnCheck(text)) {
      flags.push('PII:CREDIT_CARD');
    }

    if (SSN_RE.test(text)) {
      flags.push('PII:SSN');
    }

    if (IBAN_RE.test(text)) {
      flags.push('PII:IBAN');
    }

    return flags;
  }

  private detectSuspiciousPatterns(text: string): string[] {
    const flags: string[] = [];

    if (URL_RE.test(text)) {
      flags.push('SUSPICIOUS:URL');
    }

    if (INJECTION_RE.test(text)) {
      flags.push('SUSPICIOUS:INJECTION_ATTEMPT');
    }

    return flags;
  }

  private luhnCheck(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let alternate = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async logEvent(
    userId: string,
    context: string,
    originalText: string | null,
    flags: string[],
    action: ModerationAction,
  ): Promise<void> {
    try {
      const event = this.eventRepository.create({
        userId,
        context,
        originalText,
        flags,
        action,
      });
      await this.eventRepository.save(event);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to log moderation event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

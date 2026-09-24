import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const IP_BLOCK_TTL_SECONDS = 60;

@Injectable()
export class IpBlocklistService {
  private readonly logger = new Logger(IpBlocklistService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Returns false (allow) when Redis is unavailable — fail open to avoid
   * blocking legitimate traffic during a Redis outage.
   */
  async isBlocked(ip: string): Promise<boolean> {
    const key = this.redisService.key('ip-blocklist', ip);
    const exists = await this.redisService.exists(key);

    if (exists === null) {
      this.logger.warn(`Redis unavailable during IP blocklist check for ${ip}; allowing request`);
      return false;
    }

    return exists;
  }

  async blockIp(ip: string, ttlSeconds = IP_BLOCK_TTL_SECONDS): Promise<void> {
    const key = this.redisService.key('ip-blocklist', ip);
    await this.redisService.setString(key, '1', ttlSeconds);
    this.logger.log(`IP ${ip} blocked for ${ttlSeconds}s`);
  }

  async unblockIp(ip: string): Promise<void> {
    const key = this.redisService.key('ip-blocklist', ip);
    await this.redisService.delete(key);
    this.logger.log(`IP ${ip} unblocked`);
  }
}
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(private readonly configService: ConfigService) {
    super(configService.get('throttler'));
  }

  protected  getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip; // Use the first IP if forwarded
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check for whitelisted IPs
    const whitelist =
      this.configService.get<string[]>('THROTTLE_WHITELIST') || [];
    if (
      whitelist.includes(request.ip) ||
      whitelist.some((ip) => request.ips.includes(ip))
    ) {
      return true;
    }

    const key = this.generateKey(context, await this.getTracker(request));
    const { totalHits } = await this.storageService.increment(key, ttl);

    if (totalHits > limit) {
      throw new ThrottlerException(this.getErrorMessage());
    }

    return true;
  }

  protected getErrorMessage(): string {
    return 'Too many requests. Please try again later.';
  }
}

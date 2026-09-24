import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { IpBlocklistService } from './ip-blocklist.service';

@Injectable()
export class IpBlocklistGuard implements CanActivate {
  private readonly logger = new Logger(IpBlocklistGuard.name);

  constructor(private readonly ipBlocklistService: IpBlocklistService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.resolveIp(request);
    if (!ip) return true;

    const blocked = await this.ipBlocklistService.isBlocked(ip);
    if (blocked) {
      this.logger.warn(`Blocked request from IP ${ip}`);
      throw new ForbiddenException('Your IP address has been blocked');
    }
    return true;
  }

  private resolveIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }
}
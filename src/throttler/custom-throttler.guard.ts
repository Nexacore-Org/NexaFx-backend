import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): string {
    return req.ip; // Use the IP address as the tracker
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const { originalUrl } = context.switchToHttp().getRequest();
    
    // Apply stricter rate limits for critical routes
    if (originalUrl.includes('/auth/login')) {
      limit = 10; // 10 requests per minute
    }

    // Exempt internal/admin routes
    if (originalUrl.includes('/admin') || originalUrl.includes('/internal')) {
      return true;
    }

    return super.handleRequest(context, limit, ttl);
  }
}

// import { Injectable, ExecutionContext } from '@nestjs/common';
// import { ThrottlerGuard } from '@nestjs/throttler';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class CustomThrottlerGuard extends ThrottlerGuard {
//   constructor(private readonly configService: ConfigService) {
//     super(configService.get('throttler'));
//   }

//   protected  getTracker(req: Record<string, any>): Promise<string> {
//     return req.ips.length ? req.ips[0] : req.ip; // Use the first IP if forwarded
//   }

//   protected async handleRequest(
//     context: ExecutionContext,
//     limit: number,
//     ttl: number,
//   ): Promise<boolean> {
//     const request = context.switchToHttp().getRequest();

//     // Check for whitelisted IPs
//     const whitelist =
//       this.configService.get<string[]>('THROTTLE_WHITELIST') || [];
//     if (
//       whitelist.includes(request.ip) ||
//       whitelist.some((ip) => request.ips.includes(ip))
//     ) {
//       return true;
//     }

//     const key = this.generateKey(context, await this.getTracker(request));
//     const { totalHits } = await this.storageService.increment(key, ttl);

//     if (totalHits > limit) {
//       throw new ThrottlerException(this.getErrorMessage());
//     }

//     return true;
//   }

//   protected getErrorMessage(): string {
//     return 'Too many requests. Please try again later.';
//   }
// }

import { Injectable, ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  ThrottlerException,
  ThrottlerRequest,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    private readonly configService: ConfigService,
    protected readonly storageService: ThrottlerStorage,
    protected readonly reflector: Reflector,
  ) {
    // Call the parent constructor with default options
    super(
      {
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60),
            limit: configService.get<number>('THROTTLE_LIMIT', 10),
          },
        ],
      },
      storageService,
      reflector,
    );
  }

  // protected getTracker(req: Record<string, any>): Promise<string> {
  //   return Promise.resolve(req.ips?.length ? req.ips[0] : req.ip);
  // }

  protected getTracker(req: Record<string, any>): Promise<string> {
    return req.ips.length ? req.ips[0] : req.ip; // Use the first IP if forwarded
  }
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const request = context.switchToHttp().getRequest();

    const whitelist =
      this.configService.get<string[]>('THROTTLE_WHITELIST') || [];
    if (
      whitelist.includes(request.ip) ||
      whitelist.some(
        (ip) => Array.isArray(request.ips) && request.ips.includes(ip),
      )
    ) {
      return true;
    }

    const key = this.generateKey(
      context,
      await this.getTracker(request),
      'CustomThrottlerGuard',
    );
    const { totalHits } = await this.storageService.increment(
      key,
      ttl,
      limit,
      ttl,
      'CustomThrottlerGuard',
    );

    if (totalHits > limit) {
      throw new ThrottlerException(await this.getErrorMessage(context, {
        limit,
        ttl,
        totalHits,
        key,
        tracker: await this.getTracker(request),
        timeToExpire: ttl,
        isBlocked: true,
        timeToBlockExpire: ttl
      }));
    }

    return true;
  }

  protected async getErrorMessage(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'Too many requests. Please try again later.';
  }
}

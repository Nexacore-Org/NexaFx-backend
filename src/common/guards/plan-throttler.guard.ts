import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorageService,
  ThrottlerRequest,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../users/user.entity';
import { RateLimitConfig } from '../../users/rate-limit-config.entity';

interface AuthenticatedRequest extends Record<string, any> {
  user?: {
    userId: string;
    role: string;
  };
}

@Injectable()
export class PlanThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(PlanThrottlerGuard.name);

  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorageService,
    reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RateLimitConfig)
    private readonly rateLimitConfigRepository: Repository<RateLimitConfig>,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Override generateKey to use a consistent key based only on user tracker for authenticated users.
   * For unauthenticated requests, fallback to default behavior (includes route prefix).
   */
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.userId) {
      return suffix;
    }
    return super.generateKey(context, suffix, name);
  }

  /**
   * Override getTracker to use userId as throttle key for authenticated requests
   */
  protected getTracker(req: Record<string, any>): Promise<string> {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.userId) {
      return Promise.resolve(`user:${authReq.user.userId}`);
    }
    // Fallback to IP for unauthenticated requests
    return Promise.resolve(req.ip);
  }

  /**
   * Override handleRequest to apply dynamic rate limits based on user plan
   */
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context } = requestProps;
    const { req } = this.getRequestResponse(context);
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (user) {
      // ADMIN and SUPER_ADMIN get effectively unlimited
      const role = user.role as UserRole;
      if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
        requestProps.limit = Number.MAX_SAFE_INTEGER;
      } else {
        // Fetch user's plan and trust signals from DB to determine limit
        const userRecord = await this.userRepository.findOne({
          where: { id: user.userId },
          select: ['plan', 'kycTier', 'trustScore'],
        });

        if (userRecord) {
          const config = await this.rateLimitConfigRepository.findOne({
            where: { plan: userRecord.plan },
          });

          let baseLimit = config?.limitPerMinute ?? 60;
          
          if (config?.limitPerMinute === null) {
            requestProps.limit = Number.MAX_SAFE_INTEGER;
          } else {
            // Apply trust multiplier
            let multiplier = 1.0;
            if (userRecord.kycTier === 'BASIC') multiplier += 0.5;
            else if (userRecord.kycTier === 'ENHANCED') multiplier += 1.0;
            else if (userRecord.kycTier === 'FULL') multiplier += 2.0;
            
            if (userRecord.trustScore > 80) multiplier += 0.5;
            else if (userRecord.trustScore < 30) multiplier -= 0.5;
            
            // Ensure at least 1 multiplier
            multiplier = Math.max(0.5, multiplier);
            
            requestProps.limit = Math.floor(baseLimit * multiplier);
          }
        } else {
          // User not found, use fallback limit to avoid blocking
          requestProps.limit = 60;
        }
      }
    }
    // If no user (public), keep default configured limit

    return super.handleRequest(requestProps);
  }
}

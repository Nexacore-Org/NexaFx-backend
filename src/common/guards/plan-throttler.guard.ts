import { Injectable, ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorageService,
  ThrottlerRequest,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User, UserRole, UserPlan } from '../../users/user.entity';
import {
  RateLimitConfig,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_CONFIG_CACHE_TTL_MS,
} from '../../users/rate-limit-config.entity';

const THROTTLER_LIMIT_KEY = 'THROTTLER:LIMIT';
const UNLIMITED_LIMIT = Number.MAX_SAFE_INTEGER;
const USER_PLAN_CACHE_TTL_MS = 60_000;

interface AuthenticatedRequest extends Record<string, any> {
  user?: {
    userId: string;
    role: string;
    plan?: UserPlan;
  };
}

interface CachedUserPlan {
  plan: UserPlan;
  expiresAt: number;
}

@Injectable()
export class PlanThrottlerGuard extends ThrottlerGuard {
  private readonly planLimits = new Map<UserPlan, number | null>();
  private readonly userPlans = new Map<string, CachedUserPlan>();
  private planLimitsExpireAt = 0;

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
   * Override getRequestResponse to support GraphQL contexts.
   */
  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext();
      return { req: ctx.req, res: ctx.req?.res };
    }
    return super.getRequestResponse(context);
  }

  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const { req } = this.getRequestResponse(context);
    const authReq = req as AuthenticatedRequest;
    if (authReq?.user?.userId) {
      if (this.getRouteLimit(context, name) !== undefined) {
        return `${suffix}:${context.getClass().name}.${context.getHandler().name}`;
      }
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
    return Promise.resolve(req.ip);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context } = requestProps;
    const { req } = this.getRequestResponse(context);
    const user = (req as AuthenticatedRequest)?.user;
    const routeLimit = this.getRouteLimit(
      context,
      requestProps.throttler?.name,
    );

    if (user) {
      const role = user.role as UserRole;
      const isAdmin =
        role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

      if (isAdmin) {
        requestProps.limit = routeLimit ?? UNLIMITED_LIMIT;
      } else {
        const plan = await this.resolveUserPlan(user);
        const planLimit = plan
          ? await this.getPlanLimit(plan)
          : DEFAULT_RATE_LIMIT_PER_MINUTE;
        const effectivePlanLimit =
          planLimit === null ? UNLIMITED_LIMIT : planLimit;
        requestProps.limit =
          routeLimit === undefined
            ? effectivePlanLimit
            : Math.min(routeLimit, effectivePlanLimit);
      }
    }

    return super.handleRequest(requestProps);
  }

  private getRouteLimit(
    context: ExecutionContext,
    throttleName?: string,
  ): number | undefined {
    const limit = this.reflector.getAllAndOverride<number>(
      `${THROTTLER_LIMIT_KEY}${throttleName ?? 'default'}`,
      [context.getHandler(), context.getClass()],
    );
    return typeof limit === 'number' ? limit : undefined;
  }

  private async resolveUserPlan(
    user: AuthenticatedRequest['user'],
  ): Promise<UserPlan | null> {
    if (!user) return null;
    if (user.plan) return user.plan;

    const cached = this.userPlans.get(user.userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.plan;
    }

    const userRecord = await this.userRepository.findOne({
      where: { id: user.userId },
      select: ['plan'],
    });
    if (!userRecord?.plan) return null;

    this.userPlans.set(user.userId, {
      plan: userRecord.plan,
      expiresAt: Date.now() + USER_PLAN_CACHE_TTL_MS,
    });
    return userRecord.plan;
  }

  private async getPlanLimit(plan: UserPlan): Promise<number | null> {
    if (!this.planLimits.has(plan)) {
      await this.loadPlanLimits();
    }
    return this.planLimits.has(plan)
      ? this.planLimits.get(plan)!
      : DEFAULT_RATE_LIMIT_PER_MINUTE;
  }

  private async loadPlanLimits(): Promise<void> {
    if (this.planLimitsExpireAt > Date.now()) return;

    const configs = await this.rateLimitConfigRepository.find();
    this.planLimits.clear();
    for (const config of configs) {
      this.planLimits.set(config.plan, config.limitPerMinute);
    }
    this.planLimitsExpireAt = Date.now() + RATE_LIMIT_CONFIG_CACHE_TTL_MS;
  }
}

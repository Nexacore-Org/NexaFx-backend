import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { Repository } from 'typeorm';
import { PlanThrottlerGuard } from './plan-throttler.guard';
import { User, UserPlan, UserRole } from '../../users/user.entity';
import { RateLimitConfig } from '../../users/rate-limit-config.entity';

class ThrottlerProbeController {
  limited() {}

  unlimited() {}
}

type HandlerName = 'limited' | 'unlimited';

function createContext(
  user: Record<string, unknown>,
  handlerName: HandlerName,
): ExecutionContext {
  const req = { user, ip: '127.0.0.1', headers: {} };
  const res = { header: jest.fn() };
  return {
    getHandler: () => ThrottlerProbeController.prototype[handlerName],
    getClass: () => ThrottlerProbeController,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('PlanThrottlerGuard', () => {
  const metadata = new Map<string, number>();
  const userFindOne = jest.fn();
  const configFind = jest.fn();
  const configFindOne = jest.fn();
  const increment = jest.fn();
  let guard: PlanThrottlerGuard;

  beforeEach(async () => {
    metadata.clear();
    userFindOne.mockReset().mockResolvedValue({ plan: UserPlan.PREMIUM });
    configFind.mockReset().mockResolvedValue([
      { plan: UserPlan.PREMIUM, limitPerMinute: 100 },
      { plan: UserPlan.ENTERPRISE, limitPerMinute: null },
    ]);
    configFindOne.mockReset();
    increment.mockReset().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata.get(key)),
    } as unknown as Reflector;

    guard = new PlanThrottlerGuard(
      [{ ttl: 60_000, limit: 100 }],
      { increment } as unknown as ThrottlerStorageService,
      reflector,
      { findOne: userFindOne } as unknown as Repository<User>,
      {
        find: configFind,
        findOne: configFindOne,
      } as unknown as Repository<RateLimitConfig>,
    );
    await guard.onModuleInit();
  });

  it('caps an explicit @Throttle route at the route limit for a PREMIUM principal', async () => {
    metadata.set('THROTTLER:LIMITdefault', 5);

    await guard.canActivate(
      createContext(
        { userId: 'u1', role: UserRole.USER, plan: UserPlan.PREMIUM },
        'limited',
      ),
    );

    expect(increment).toHaveBeenCalledTimes(1);
    const [key, , limit] = increment.mock.calls[0];
    expect(limit).toBe(5);
    expect(key).toContain('ThrottlerProbeController.limited');
    expect(userFindOne).not.toHaveBeenCalled();
    expect(configFind).toHaveBeenCalledTimes(1);
  });

  it('uses the cached plan limit for routes without an explicit @Throttle', async () => {
    await guard.canActivate(
      createContext(
        { userId: 'u1', role: UserRole.USER, plan: UserPlan.PREMIUM },
        'unlimited',
      ),
    );

    const [key, , limit] = increment.mock.calls[0];
    expect(limit).toBe(100);
    expect(key).toBe('user:u1');
  });

  it('does not query repositories on the hot path once plan data is cached', async () => {
    const principal = { userId: 'u1', role: UserRole.USER };

    await guard.canActivate(createContext(principal, 'unlimited'));
    await guard.canActivate(createContext(principal, 'unlimited'));

    expect(userFindOne).toHaveBeenCalledTimes(1);
    expect(configFind).toHaveBeenCalledTimes(1);
    expect(configFindOne).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment.mock.calls[1][2]).toBe(100);
  });

  it('still applies an explicit route limit to an unlimited plan', async () => {
    metadata.set('THROTTLER:LIMITdefault', 5);

    await guard.canActivate(
      createContext(
        { userId: 'u2', role: UserRole.USER, plan: UserPlan.ENTERPRISE },
        'limited',
      ),
    );

    expect(increment.mock.calls[0][2]).toBe(5);
  });

  it('caps admins on explicit routes while leaving other admin routes unlimited', async () => {
    metadata.set('THROTTLER:LIMITdefault', 5);
    const admin = { userId: 'admin-1', role: UserRole.ADMIN };

    await guard.canActivate(createContext(admin, 'limited'));
    metadata.clear();
    await guard.canActivate(createContext(admin, 'unlimited'));

    expect(increment.mock.calls[0][2]).toBe(5);
    expect(increment.mock.calls[1][2]).toBe(Number.MAX_SAFE_INTEGER);
    expect(userFindOne).not.toHaveBeenCalled();
    expect(configFind).not.toHaveBeenCalled();
  });
});

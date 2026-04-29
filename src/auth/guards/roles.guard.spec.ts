import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const createContext = (role?: UserRole): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role
            ? { userId: 'user-id', email: 'user@nexafx.test', role }
            : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows requests when no roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.USER))).toBe(true);
  });

  it('allows SUPER_ADMIN to satisfy ADMIN requirements', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.SUPER_ADMIN))).toBe(true);
  });

  it('denies ADMIN access to SUPER_ADMIN-only routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.SUPER_ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(false);
  });
});

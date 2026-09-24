import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { RolesGuard } from './roles.guard';

describe('RolesGuard (Common)', () => {
  const createContext = (
    role?: UserRole | string,
    hasUser = true,
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: hasUser
            ? role
              ? { userId: 'user-id', email: 'user@nexafx.test', role }
              : {}
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

  it('allows ADMIN to satisfy ADMIN requirements', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true);
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

  it('denies USER access to ADMIN required routes by throwing ForbiddenException', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the user is missing entirely', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(undefined, false))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the user role is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key) => {
        if (key === ROLES_KEY) {
          return [UserRole.ADMIN];
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(createContext(undefined, true))).toThrow(
      ForbiddenException,
    );
  });
});

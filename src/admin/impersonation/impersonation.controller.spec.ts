import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: any) => `${entity?.name ?? 'Entity'}Repository`,
  TypeOrmModule: { forFeature: () => ({}) },
}));

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => {};
  return {
    ApiTags: noop,
    ApiOperation: noop,
    ApiResponse: noop,
    ApiBearerAuth: noop,
    ApiBody: noop,
    ApiParam: noop,
    ApiQuery: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
    PartialType: (cls: any) => cls,
    OmitType: (cls: any) => cls,
    PickType: (cls: any) => cls,
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class {},
  ConfigModule: { forRoot: () => ({}) },
}));

jest.mock('@nestjs/passport', () => ({
  PassportStrategy: () =>
    class {
      constructor(..._args: any[]) {}
    },
  AuthGuard: () =>
    class {
      canActivate() {
        return true;
      }
    },
}));

jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../../users/users.service', () => ({
  UsersService: class {},
}));

jest.mock('../../audit-logs/audit-logs.service', () => ({
  AuditLogsService: class {},
}));

import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../users/user.entity';
import { validateAuthenticatedUser } from '../../auth/authenticated-user';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';

describe('Impersonation (Controller, Service & JWT Validation)', () => {
  let controller: ImpersonationController;
  let impersonationService: ImpersonationService;

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    keys: jest.fn(),
  };

  const mockAuditLogsService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'IMPERSONATION_TOKEN_EXPIRY_MINUTES') return 30;
      if (key === 'JWT_SECRET') return 'secret';
      return defaultValue;
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ImpersonationController],
      providers: [
        ImpersonationService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = moduleRef.get<ImpersonationController>(
      ImpersonationController,
    );
    impersonationService =
      moduleRef.get<ImpersonationService>(ImpersonationService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service: startImpersonation', () => {
    it('successfully generates impersonation token for valid USER role', async () => {
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'admin-123',
        role: UserRole.ADMIN,
      });
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'user-456',
        email: 'user@nexafx.com',
        role: UserRole.USER,
      });

      const res = await impersonationService.startImpersonation(
        'admin-123',
        'user-456',
      );
      expect(res).toHaveProperty('impersonationToken', 'mock-jwt-token');
      expect(res).toHaveProperty('expiresAt');
      expect(mockRedisService.set).toHaveBeenCalledTimes(2); // session + admin index pointer
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        'admin-123',
        'admin.impersonation.started',
        'admin',
        'user-456',
        'SUCCESS',
        expect.any(Object),
        undefined,
      );
    });

    it('rejects impersonating an admin/super-admin account (422)', async () => {
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'admin-123',
        role: UserRole.ADMIN,
      });
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'another-admin',
        role: UserRole.ADMIN,
      });

      await expect(
        impersonationService.startImpersonation('admin-123', 'another-admin'),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('Controller endpoints', () => {
    it('POST /admin/impersonate/:userId triggers startImpersonation', async () => {
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'admin-123',
        role: UserRole.ADMIN,
      });
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'user-456',
        email: 'user@nexafx.com',
        role: UserRole.USER,
      });

      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const res = await controller.impersonate(
        {
          userId: 'admin-123',
          email: 'admin@nexafx.com',
          role: UserRole.ADMIN,
          isImpersonation: false,
        },
        uuid,
        {},
      );
      expect(res.impersonationToken).toBe('mock-jwt-token');
    });

    it('POST /admin/impersonate/end invalidates Redis entries and logs event', async () => {
      mockRedisService.get.mockResolvedValueOnce({
        jti: 'session-jti-uuid',
        targetUserId: 'user-456',
        targetUserEmail: 'user@nexafx.com',
        adminId: 'admin-123',
        startedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      });

      const res = await controller.endImpersonate(
        {
          userId: 'user-456',
          email: 'user@nexafx.com',
          jti: 'session-jti-uuid',
          role: UserRole.USER,
          isImpersonation: true,
          impersonatedBy: 'admin-123',
        },
        {},
      );
      expect(res.message).toBe('Impersonation session ended');

      expect(mockRedisService.del).toHaveBeenCalledWith(
        'nexafx:impersonation:user-456:session-jti-uuid',
      );
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'nexafx:impersonation:admin:admin-123:session-jti-uuid',
      );
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        'admin-123',
        'admin.impersonation.ended',
        'admin',
        'user-456',
        'SUCCESS',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('POST /admin/impersonate/end with a regular access token throws BadRequestException (400) and writes no audit row', async () => {
      await expect(
        controller.endImpersonate(
          {
            userId: 'admin-123',
            email: 'admin@nexafx.com',
            role: UserRole.ADMIN,
            isImpersonation: false,
          },
          {},
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockRedisService.del).not.toHaveBeenCalled();
      expect(mockAuditLogsService.log).not.toHaveBeenCalled();
    });

    it('POST /admin/impersonate/end throws NotFoundException (404) when the Redis session does not exist and writes no audit row', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        controller.endImpersonate(
          {
            userId: 'user-456',
            email: 'user@nexafx.com',
            jti: 'expired-jti',
            role: UserRole.USER,
            isImpersonation: true,
            impersonatedBy: 'admin-123',
          },
          {},
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockRedisService.del).not.toHaveBeenCalled();
      expect(mockAuditLogsService.log).not.toHaveBeenCalled();
    });

    it('GET /admin/impersonation/active uses Redis SCAN instead of KEYS', async () => {
      mockRedisService.scan.mockResolvedValueOnce([
        'nexafx:impersonation:admin:admin-123:session-jti-uuid',
      ]);
      mockRedisService.get.mockResolvedValueOnce({
        jti: 'session-jti-uuid',
        targetUserId: 'user-456',
        targetUserEmail: 'user@nexafx.com',
        adminId: 'admin-123',
        startedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      });

      const res = await controller.getActiveSessions({
        userId: 'admin-123',
        email: 'admin@nexafx.com',
        role: UserRole.ADMIN,
      });

      expect(res.total).toBe(1);
      expect(res.sessions[0].targetUserId).toBe('user-456');
      expect(mockRedisService.scan).toHaveBeenCalledWith(
        'nexafx:impersonation:admin:admin-123:*',
      );
      expect(mockRedisService.keys).not.toHaveBeenCalled();
    });
  });

  describe('JWT Impersonation Session Validation (#1488)', () => {
    const activeTargetUser = {
      id: 'user-456',
      email: 'user@nexafx.com',
      role: UserRole.USER,
      isActive: true,
      isSuspended: false,
      isDeleted: false,
    };

    const activeAdminUser = {
      id: 'admin-123',
      email: 'admin@nexafx.com',
      role: UserRole.ADMIN,
      isActive: true,
      isSuspended: false,
      isDeleted: false,
    };

    const payload = {
      sub: 'user-456',
      email: 'user@nexafx.com',
      role: UserRole.USER,
      isImpersonation: true,
      impersonatedBy: 'admin-123',
      jti: 'session-jti-uuid',
    };

    it('accepts an active impersonation token when Redis session and admin are valid', async () => {
      mockUsersService.findById
        .mockResolvedValueOnce(activeTargetUser)
        .mockResolvedValueOnce(activeAdminUser);
      mockRedisService.get.mockResolvedValueOnce({
        adminId: 'admin-123',
        targetUserId: 'user-456',
        jti: 'session-jti-uuid',
      });

      const strategy = new JwtStrategy(
        mockConfigService as unknown as ConfigService,
        mockUsersService as unknown as UsersService,
        mockRedisService as unknown as RedisService,
        impersonationService,
      );

      const user = await strategy.validate(payload);
      expect(user).toMatchObject({
        userId: 'user-456',
        role: 'USER',
        isImpersonation: true,
        impersonatedBy: 'admin-123',
        jti: 'session-jti-uuid',
      });
    });

    it('rejects the impersonation token with 401 after endImpersonation removes the Redis session', async () => {
      mockRedisService.get.mockResolvedValueOnce({
        adminId: 'admin-123',
        targetUserId: 'user-456',
        jti: 'session-jti-uuid',
      });
      await impersonationService.endImpersonation(
        'user-456',
        'session-jti-uuid',
        'admin-123',
      );

      mockUsersService.findById.mockResolvedValueOnce(activeTargetUser);
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        validateAuthenticatedUser(
          mockUsersService as unknown as UsersService,
          payload,
          impersonationService,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the impersonation token with 401 after Redis session expires', async () => {
      mockUsersService.findById.mockResolvedValueOnce(activeTargetUser);
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        validateAuthenticatedUser(
          mockUsersService as unknown as UsersService,
          payload,
          impersonationService,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the impersonation token with 401 when session adminId does not match impersonatedBy', async () => {
      mockUsersService.findById.mockResolvedValueOnce(activeTargetUser);
      mockRedisService.get.mockResolvedValueOnce({
        adminId: 'other-admin-999',
        targetUserId: 'user-456',
        jti: 'session-jti-uuid',
      });

      await expect(
        validateAuthenticatedUser(
          mockUsersService as unknown as UsersService,
          payload,
          impersonationService,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the impersonation token with 401 when the impersonating admin is demoted to USER', async () => {
      mockUsersService.findById
        .mockResolvedValueOnce(activeTargetUser)
        .mockResolvedValueOnce({
          ...activeAdminUser,
          role: UserRole.USER,
        });
      mockRedisService.get.mockResolvedValueOnce({
        adminId: 'admin-123',
        targetUserId: 'user-456',
        jti: 'session-jti-uuid',
      });

      await expect(
        validateAuthenticatedUser(
          mockUsersService as unknown as UsersService,
          payload,
          impersonationService,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the impersonation token with 401 when the impersonating admin is suspended or deleted', async () => {
      mockUsersService.findById
        .mockResolvedValueOnce(activeTargetUser)
        .mockResolvedValueOnce({
          ...activeAdminUser,
          isSuspended: true,
        });
      mockRedisService.get.mockResolvedValueOnce({
        adminId: 'admin-123',
        targetUserId: 'user-456',
        jti: 'session-jti-uuid',
      });

      await expect(
        validateAuthenticatedUser(
          mockUsersService as unknown as UsersService,
          payload,
          impersonationService,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  HttpStatus,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as request from 'supertest';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../users/user.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ExecutionContext } from '@nestjs/common';

describe('Impersonation (Controller & Service)', () => {
  let app: INestApplication;
  let impersonationService: ImpersonationService;

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
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

  // Mock Authentication Guards for route testing
  const mockJwtAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      // Emulate authenticated admin by default
      req.user = {
        userId: 'admin-123',
        email: 'admin@nexafx.com',
        role: UserRole.ADMIN,
        isImpersonation: false,
      };
      return true;
    },
  };

  const mockRolesGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      return user && (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
    },
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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    impersonationService = moduleRef.get<ImpersonationService>(ImpersonationService);
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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

      const res = await impersonationService.startImpersonation('admin-123', 'user-456');
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
      await request(app.getHttpServer())
        .post(`/admin/impersonate/${uuid}`)
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body.impersonationToken).toBe('mock-jwt-token');
        });
    });

    it('POST /admin/impersonate/end invalidates Redis entries and logs event', async () => {
      // Setup req.user to act as impersonated user for this test
      jest.spyOn(mockJwtAuthGuard, 'canActivate').mockImplementationOnce((context: ExecutionContext) => {
        const req = context.switchToHttp().getRequest();
        req.user = {
          userId: 'user-456',
          jti: 'session-jti-uuid',
          role: UserRole.USER,
          isImpersonation: true,
          impersonatedBy: 'admin-123',
        };
        return true;
      });

      await request(app.getHttpServer())
        .post('/admin/impersonate/end')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body.message).toBe('Impersonation session ended');
        });

      expect(mockRedisService.del).toHaveBeenCalledWith('nexafx:impersonation:user-456:session-jti-uuid');
      expect(mockRedisService.del).toHaveBeenCalledWith('nexafx:impersonation:admin:admin-123:session-jti-uuid');
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

    it('GET /admin/impersonation/active returns active sessions from admin index', async () => {
      mockRedisService.keys.mockResolvedValueOnce([
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

      await request(app.getHttpServer())
        .get('/admin/impersonation/active')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body.total).toBe(1);
          expect(res.body.sessions[0].targetUserId).toBe('user-456');
        });
    });
  });
});

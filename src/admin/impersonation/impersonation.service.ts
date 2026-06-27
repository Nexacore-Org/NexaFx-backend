import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuditAction } from '../../audit-logs/enums/audit-action.enum';
import { UserRole } from '../../users/user.entity';
import type { ActiveImpersonationSessionDto } from './dto/impersonation.dto';

/** Shape stored in Redis for each active session */
export interface ImpersonationSession {
  adminId: string;
  targetUserId: string;
  targetUserEmail: string;
  jti: string;
  startedAt: string;
  expiresAt: string;
}

/** Redis key for a single session */
const sessionKey = (targetUserId: string, jti: string) =>
  `nexafx:impersonation:${targetUserId}:${jti}`;

/** Redis key pattern for all sessions by a given admin */
const adminSessionPattern = (adminId: string) =>
  `nexafx:impersonation:admin:${adminId}:*`;

/** Redis key that stores the jti list for a given admin */
const adminSessionIndexKey = (adminId: string, jti: string) =>
  `nexafx:impersonation:admin:${adminId}:${jti}`;

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  private readonly DEFAULT_EXPIRY_MINUTES = 30;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Starts an impersonation session.
   *
   * @param adminId   The authenticated admin starting the session
   * @param targetUserId  The user to impersonate
   * @param request  Express request (for audit logging)
   */
  async startImpersonation(
    adminId: string,
    targetUserId: string,
    request?: unknown,
  ): Promise<{ impersonationToken: string; expiresAt: string }> {
    // 1. Verify admin is not currently impersonating (nested impersonation)
    const adminUser = await this.usersService.findById(adminId);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    // 2. Verify target user exists
    const targetUser = await this.usersService.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // 3. Reject impersonating ADMIN or SUPER_ADMIN users (HTTP 422)
    if (
      targetUser.role === UserRole.ADMIN ||
      targetUser.role === UserRole.SUPER_ADMIN
    ) {
      throw new UnprocessableEntityException(
        'Cannot impersonate an admin or super-admin account',
      );
    }

    // 4. Determine TTL
    const expiryMinutes =
      this.configService.get<number>('IMPERSONATION_TOKEN_EXPIRY_MINUTES') ??
      this.DEFAULT_EXPIRY_MINUTES;
    const ttlSeconds = expiryMinutes * 60;

    // 5. Build unique token id
    const jti = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // 6. Sign the impersonation JWT
    const secret =
      this.configService.get<string>('JWT_SECRET') ||
      'default-secret-change-in-production';

    const impersonationToken = this.jwtService.sign(
      {
        sub: targetUserId,
        impersonatedBy: adminId,
        role: UserRole.USER,
        isImpersonation: true,
        jti,
      },
      {
        secret,
        expiresIn: `${ttlSeconds}s`,
      },
    );

    // 7. Persist session in Redis (main session key)
    const session: ImpersonationSession = {
      adminId,
      targetUserId,
      targetUserEmail: targetUser.email,
      jti,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.redisService.set(
      sessionKey(targetUserId, jti),
      session,
      ttlSeconds,
    );

    // 8. Also store a pointer in the admin index so we can list active sessions
    await this.redisService.set(
      adminSessionIndexKey(adminId, jti),
      session,
      ttlSeconds,
    );

    // 9. Write audit event
    await this.auditLogsService
      .log(
        adminId,
        AuditAction.IMPERSONATION_STARTED,
        'admin',
        targetUserId,
        'SUCCESS',
        {
          targetUserId,
          targetUserEmail: targetUser.email,
          jti,
          expiresAt: expiresAt.toISOString(),
        },
        request,
      )
      .catch((err: Error) =>
        this.logger.error(`Audit log failed: ${err.message}`),
      );

    return {
      impersonationToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Ends an impersonation session.
   * Must be called using the impersonation token itself.
   *
   * @param targetUserId  The user currently being impersonated (from token sub)
   * @param jti           Unique token ID from the JWT
   * @param adminId       Admin who started the session (from token impersonatedBy)
   * @param request       Express request
   */
  async endImpersonation(
    targetUserId: string,
    jti: string,
    adminId: string,
    request?: unknown,
  ): Promise<{ message: string }> {
    // Remove the main session key
    await this.redisService.del(sessionKey(targetUserId, jti));

    // Remove the admin index entry
    await this.redisService.del(adminSessionIndexKey(adminId, jti));

    // Write audit event
    await this.auditLogsService
      .log(
        adminId,
        AuditAction.IMPERSONATION_ENDED,
        'admin',
        targetUserId,
        'SUCCESS',
        { targetUserId, jti },
        request,
      )
      .catch((err: Error) =>
        this.logger.error(`Audit log failed: ${err.message}`),
      );

    return { message: 'Impersonation session ended' };
  }

  /**
   * Returns all active impersonation sessions started by a given admin.
   */
  async getActiveSessions(
    adminId: string,
  ): Promise<{ sessions: ActiveImpersonationSessionDto[]; total: number }> {
    const pattern = adminSessionPattern(adminId);
    const keys = await this.scanKeys(pattern);

    const sessions: ActiveImpersonationSessionDto[] = [];

    for (const key of keys) {
      const session = await this.redisService.get<ImpersonationSession>(key);
      if (session) {
        sessions.push({
          jti: session.jti,
          targetUserId: session.targetUserId,
          targetUserEmail: session.targetUserEmail,
          adminId: session.adminId,
          startedAt: session.startedAt,
          expiresAt: session.expiresAt,
          redisKey: sessionKey(session.targetUserId, session.jti),
        });
      }
    }

    return { sessions, total: sessions.length };
  }

  /**
   * Validates that a Redis-backed impersonation session exists.
   * Returns the session if valid, null otherwise.
   */
  async validateSession(
    targetUserId: string,
    jti: string,
  ): Promise<ImpersonationSession | null> {
    return this.redisService.get<ImpersonationSession>(
      sessionKey(targetUserId, jti),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lists Redis keys matching a pattern using RedisService.keys().
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    try {
      return await this.redisService.keys(pattern);
    } catch {
      this.logger.warn('Could not scan Redis keys for pattern: ' + pattern);
      return [];
    }
  }
}

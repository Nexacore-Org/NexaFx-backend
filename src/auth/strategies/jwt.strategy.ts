import { Injectable, Optional } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';
import { ImpersonationService } from '../../admin/impersonation/impersonation.service';
import {
  validateAuthenticatedUser,
  type AuthenticatedUser,
  type ImpersonationSessionLookup,
  type JwtPayload,
} from '../authenticated-user';

// Re-exported for backwards compatibility: these types used to live here.
export type { AuthenticatedUser, JwtPayload };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    @Optional()
    private readonly impersonationService?: ImpersonationService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    if (!secret && isProduction) {
      throw new Error('JWT_SECRET must be set in production environment');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'default-secret-change-in-production',
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const sessionLookup: ImpersonationSessionLookup = {
      validateSession: async (targetUserId: string, jti: string) => {
        if (this.impersonationService?.validateSession) {
          return this.impersonationService.validateSession(targetUserId, jti);
        }
        return this.redisService.get<{ adminId: string }>(
          `nexafx:impersonation:${targetUserId}:${jti}`,
        );
      },
    };

    return validateAuthenticatedUser(this.usersService, payload, sessionLookup);
  }
}

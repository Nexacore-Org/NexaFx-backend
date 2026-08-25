import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  authStage?: 'partial_auth';
  // Impersonation fields — only present when isImpersonation === true
  isImpersonation?: boolean;
  impersonatedBy?: string;
  jti?: string;
}

/** Shape attached to request.user after JWT validation */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  authStage?: string;
  isImpersonation?: boolean;
  impersonatedBy?: string;
  jti?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
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
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.isSuspended) {
      throw new ForbiddenException('Account is suspended');
    }

    if (user.isDeleted) {
      throw new UnauthorizedException('Account has been deleted');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    return {
      userId: user.id,
      email: user.email,
      role: payload.isImpersonation ? 'USER' : user.role,
      authStage: payload.authStage,
      isImpersonation: payload.isImpersonation ?? false,
      impersonatedBy: payload.impersonatedBy,
      jti: payload.jti,
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../modules/redis/redis.service';
import {
  validateAuthenticatedUser,
  type AuthenticatedUser,
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
    if (payload?.jti && typeof this.redisService?.get === 'function') {
      const revoked = await this.redisService.get<boolean>(
        `nexafx:jwt:revoked:${payload.jti}`,
      );
      if (revoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return validateAuthenticatedUser(this.usersService, payload);
  }
}

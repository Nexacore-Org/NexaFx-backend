import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../common/services/redis.service';
import { resolveJwtSecret } from '../../common/helpers/jwt-secret';
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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return validateAuthenticatedUser(this.usersService, payload);
  }
}

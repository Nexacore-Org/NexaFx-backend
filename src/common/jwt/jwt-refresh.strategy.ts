import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from 'src/user/providers/user.service';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';

// Define the JWT payload interface
interface JwtPayload {
  sub: string;
  email?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private readonly usersService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const cookies = req?.cookies as Record<string, string> | undefined;
          return cookies?.['refresh_token'] || null;
        },
      ]),
      secretOrKey: process.env.REFRESH_TOKEN_SECRET!,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const refreshToken = cookies?.['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const activeToken = user.tokens.find((token) => token.isRevoked === false);

    if (!activeToken?.refreshToken) {
      throw new UnauthorizedException('No active refresh token found');
    }

    const isValid = await bcrypt.compare(
      refreshToken,
      activeToken.refreshToken,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return user;
  }
}

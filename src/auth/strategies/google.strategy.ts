import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import { OAuthProvider } from '../entities/oauth-account.entity';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<any> {
    try {
      const rawProfile = profile as any;
      const email =
        profile.emails?.[0]?.value ?? rawProfile._json?.email ?? null;
      if (!email) {
        return done(null, { error: 'No email found in Google profile' });
      }

      const firstName =
        profile.name?.givenName ?? rawProfile._json?.given_name ?? null;
      const lastName =
        profile.name?.familyName ?? rawProfile._json?.family_name ?? null;

      const result = await this.authService.handleOAuthLogin({
        provider: OAuthProvider.GOOGLE,
        providerAccountId: profile.id,
        email,
        firstName,
        lastName,
        accessToken,
        refreshToken: refreshToken || null,
        profile: rawProfile._json ?? profile,
      });

      return done(null, result);
    } catch (error: any) {
      return done(null, { error: error.message ?? 'Google OAuth failed' });
    }
  }
}

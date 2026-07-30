import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { AuthService } from '../auth.service';
import { OAuthProvider } from '../entities/oauth-account.entity';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GITHUB_CLIENT_ID')!,
      clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GITHUB_CALLBACK_URL')!,
      scope: ['user:email'],
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
        rawProfile.emails?.[0]?.value ?? rawProfile._json?.email ?? null;
      if (!email) {
        return done(null, { error: 'No email found in GitHub profile' });
      }

      const nameParts = (
        profile.displayName ??
        rawProfile.username ??
        ''
      ).split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;

      const result = await this.authService.handleOAuthLogin({
        provider: OAuthProvider.GITHUB,
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
      return done(null, { error: error.message ?? 'GitHub OAuth failed' });
    }
  }
}

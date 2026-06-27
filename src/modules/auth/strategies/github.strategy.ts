import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { OAuthProvider } from '../entities/oauth-account.entity';
import { encryptWithAes256Gcm } from '../../common/utils/encryption.util';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GITHUB_CLIENT_ID'),
      clientSecret: configService.get<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GITHUB_CALLBACK_URL'),
      scope: ['user:email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const encryptedAccess = encryptWithAes256Gcm(accessToken, process.env.WALLET_ENCRYPTION_KEY!);
    const encryptedRefresh = refreshToken
      ? encryptWithAes256Gcm(refreshToken, process.env.WALLET_ENCRYPTION_KEY!)
      : undefined;

    const result = await this.authService.handleOAuthLogin(
      OAuthProvider.GITHUB,
      profile.id,
      { accessToken: encryptedAccess, refreshToken: encryptedRefresh },
      profile,
    );
    done(null, result);
  }
}

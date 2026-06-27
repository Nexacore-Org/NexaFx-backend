import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { OAuthProvider } from '../entities/oauth-account.entity';
import { encryptWithAes256Gcm, getWalletEncryptionKey } from '../../common/utils/encryption.util';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback): Promise<any> {
    const encryptedAccess = encryptWithAes256Gcm(accessToken, process.env.WALLET_ENCRYPTION_KEY!);
    const encryptedRefresh = refreshToken
      ? encryptWithAes256Gcm(refreshToken, process.env.WALLET_ENCRYPTION_KEY!)
      : undefined;

    const result = await this.authService.handleOAuthLogin(
      OAuthProvider.GOOGLE,
      profile.id,
      { accessToken: encryptedAccess, refreshToken: encryptedRefresh },
      profile,
    );
    // result contains { redirectUrl, user }
    done(null, result);
  }
}

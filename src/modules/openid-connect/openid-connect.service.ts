import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthorizeRequestDto, TokenRequestDto } from './dto/openid-connect.dto';
import * as crypto from 'crypto';

@Injectable()
export class OpenidConnectService {
  private codes = new Map<string, any>();

  /**
   * Initiates OIDC authorization code flow.
   */
  public generateAuthorizationCode(dto: AuthorizeRequestDto, userId: string): string {
    if (dto.response_type !== 'code') {
      throw new Error('Unsupported response type. Only "code" is supported.');
    }
    
    const code = crypto.randomBytes(16).toString('hex');
    this.codes.set(code, {
      clientId: dto.client_id,
      redirectUri: dto.redirect_uri,
      userId,
      nonce: dto.nonce,
      scopes: dto.scope.split(' '),
    });
    
    return code;
  }

  /**
   * Exchanges an authorization code for tokens.
   */
  public exchangeCodeForTokens(dto: TokenRequestDto) {
    const session = this.codes.get(dto.code);
    if (!session || session.clientId !== dto.client_id || session.redirectUri !== dto.redirect_uri) {
      throw new UnauthorizedException('Invalid or expired authorization code.');
    }
    
    // In a real implementation, JWT signing would occur here using standard libraries
    const idToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_id_token_for_${session.userId}`;
    const accessToken = crypto.randomBytes(32).toString('hex');

    this.codes.delete(dto.code); // One-time use

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
    };
  }
}

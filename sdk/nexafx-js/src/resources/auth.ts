import type { NexaFxClient } from '../client';
import type {
  AuthTokensDto,
  LoginFlowParams,
  MessageResponse,
  RefreshTokenRequestDto,
  VerifyLoginOtpDto,
  VerifyLoginOtpResponseDto,
  VerifyTwoFactorDto,
} from '../types';

export class AuthResource {
  constructor(private readonly client: NexaFxClient) {}

  async login(
    params: LoginFlowParams,
  ): Promise<MessageResponse | VerifyLoginOtpResponseDto> {
    const { otp, totpCode, ...credentials } = params;

    const loginResponse = await this.client.request<MessageResponse>(
      'POST',
      '/v1/auth/login',
      {
        body: credentials,
        auth: false,
      },
    );

    if (!otp) {
      return loginResponse;
    }

    const verifyResponse = await this.verifyLoginOtp({
      email: credentials.email,
      otp,
    });

    if (this.isTwoFactorChallenge(verifyResponse) && totpCode) {
      return this.verifyTwoFactor({
        twoFactorToken: verifyResponse.twoFactorToken,
        totpCode,
      });
    }

    return verifyResponse;
  }

  async verifyLoginOtp(
    payload: VerifyLoginOtpDto,
  ): Promise<VerifyLoginOtpResponseDto> {
    const response = await this.client.request<VerifyLoginOtpResponseDto>(
      'POST',
      '/v1/auth/verify-login-otp',
      {
        body: payload,
        auth: false,
      },
    );

    if (this.isTokenResponse(response)) {
      this.client.setTokens(response);
    }

    return response;
  }

  async verifyTwoFactor(payload: VerifyTwoFactorDto): Promise<AuthTokensDto> {
    const response = await this.client.request<AuthTokensDto>(
      'POST',
      '/v1/auth/verify-2fa',
      {
        body: payload,
        auth: false,
      },
    );

    this.client.setTokens(response);
    return response;
  }

  async refresh(
    payload?: RefreshTokenRequestDto,
  ): Promise<AuthTokensDto> {
    const response = await this.client.request<AuthTokensDto>(
      'POST',
      '/v1/auth/refresh',
      {
        body: payload ?? { refreshToken: this.client.requireRefreshToken() },
        auth: false,
        retryOn401: false,
      },
    );

    this.client.setTokens(response);
    return response;
  }

  setTokens(tokens: Partial<AuthTokensDto>) {
    this.client.setTokens(tokens);
  }

  clearTokens() {
    this.client.clearTokens();
  }

  private isTokenResponse(
    response: VerifyLoginOtpResponseDto,
  ): response is AuthTokensDto {
    return 'accessToken' in response;
  }

  private isTwoFactorChallenge(response: VerifyLoginOtpResponseDto) {
    return 'requiresTwoFactor' in response && response.requiresTwoFactor;
  }
}

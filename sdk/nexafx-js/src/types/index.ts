import type { components } from './generated';

export type LoginDto = components['schemas']['LoginDto'];
export type MessageResponse = components['schemas']['MessageResponse'];
export type VerifyLoginOtpDto = components['schemas']['VerifyLoginOtpDto'];
export type VerifyTwoFactorDto = components['schemas']['VerifyTwoFactorDto'];
export type RefreshTokenRequestDto =
  components['schemas']['RefreshTokenRequestDto'];
export type AuthTokensDto = components['schemas']['AuthTokensDto'];
export type TwoFactorChallengeDto =
  components['schemas']['TwoFactorChallengeDto'];
export type VerifyLoginOtpResponseDto =
  components['schemas']['VerifyLoginOtpResponseDto'];
export type CreateDepositDto = components['schemas']['CreateDepositDto'];
export type CreateWithdrawalDto = components['schemas']['CreateWithdrawalDto'];
export type TransactionResponseDto =
  components['schemas']['TransactionResponseDto'];
export type TransactionListResponseDto =
  components['schemas']['TransactionListResponseDto'];
export type ExchangeRateResponseDto =
  components['schemas']['ExchangeRateResponseDto'];
export type TransactionStatus = components['schemas']['TransactionStatus'];
export type TransactionType = components['schemas']['TransactionType'];

export type CreateTransactionDto =
  | ({ type: 'deposit' } & CreateDepositDto)
  | ({ type: 'withdraw' | 'withdrawal' } & CreateWithdrawalDto);

export interface PriceUpdate {
  symbol: string;
  bid: number;
  ask: number;
  mid?: number;
  timestamp: string;
}

export interface LoginFlowParams extends LoginDto {
  otp?: string;
  totpCode?: string;
}

export * from './generated';

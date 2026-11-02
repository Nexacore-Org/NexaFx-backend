import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export const ALLOWED_REWARD_CURRENCIES = ['XLM', 'USDC'] as const;
export type AllowedRewardCurrency = (typeof ALLOWED_REWARD_CURRENCIES)[number];

export class DistributeRewardDto {
  @ApiProperty({ description: 'User UUID receiving the reward' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Reward amount', example: 100.5 })
  @IsPositive({ message: 'Amount must be a positive number.' })
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'Amount cannot exceed 7 decimal places.' },
  )
  amount: number;

  @ApiProperty({
    description: 'Reward currency',
    example: 'XLM',
    enum: ALLOWED_REWARD_CURRENCIES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_REWARD_CURRENCIES, {
    message: 'Unsupported reward currency.',
  })
  currency: string;

  @ApiPropertyOptional({
    description: 'Optional request identifier for per-user idempotency',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  requestId?: string;
}

import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SUPPORTED_QR_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'NGN',
  'KES',
  'GHS',
  'ZAR',
  'XLM',
  'USDC',
  'USDT',
] as const;

export type SupportedQrCurrency = (typeof SUPPORTED_QR_CURRENCIES)[number];

export class GenerateDynamicQrDto {
  @ApiProperty({ description: 'Merchant identifier' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ description: 'Positive payment amount' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Unique checkout reference' })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiPropertyOptional({
    description: 'Payment currency code',
    enum: SUPPORTED_QR_CURRENCIES,
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_QR_CURRENCIES)
  currency?: string = 'USD';

  @ApiPropertyOptional({
    description: 'Optional TTL in seconds for the QR payload',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  ttlSeconds?: number;
}

export class ScanQrDto {
  @ApiProperty({
    description: 'Signed QR payload JSON string or generated QR data URL',
  })
  @IsString()
  @IsNotEmpty()
  payload: string;
}

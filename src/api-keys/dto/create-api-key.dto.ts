import {
  IsString,
  IsArray,
  IsOptional,
  IsDateString,
  ArrayNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Human-readable name for the API key',
    example: 'Payment Processor Webhook',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Array of scopes for the API key',
    example: ['webhook:receive', 'transactions:read'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes: string[];

  @ApiPropertyOptional({
    description: 'Optional expiration date for the API key',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}

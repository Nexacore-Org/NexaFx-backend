import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeRateResponseDto {
  @ApiProperty({ example: 'NGN' })
  from: string;

  @ApiProperty({ example: 'USD' })
  to: string;

  @ApiProperty({ example: 0.0012 })
  rate: number;

  @ApiPropertyOptional({
    example: '2026-01-26T00:00:00.000Z',
    description: 'Timestamp when the rate was fetched',
  })
  fetchedAt?: string;

  @ApiPropertyOptional({
    example: '2026-01-26T00:10:00.000Z',
    description: 'Timestamp when the cached rate expires',
  })
  expiresAt?: string;
}

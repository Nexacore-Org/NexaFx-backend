import { ApiProperty } from '@nestjs/swagger';

export class GetRateResponseDto {
  @ApiProperty({
    description: 'Exchange rate between source and target',
    example: 123.45,
  })
  rate: number;

  @ApiProperty({
    description: 'Estimated fee for the conversion',
    example: 1.23,
  })
  fee: number;

  @ApiProperty({ description: 'Net amount after fee', example: 98.77 })
  netAmount: number;

  @ApiProperty({
    description: 'Expiry timestamp for quote',
    example: '2025-06-05T21:13:54.000Z',
  })
  expiresAt: Date;
}

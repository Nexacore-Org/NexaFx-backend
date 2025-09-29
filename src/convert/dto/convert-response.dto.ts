import { ApiProperty } from '@nestjs/swagger';

export class ConvertResponseDto {
  @ApiProperty({
    description: 'Conversion transaction ID',
    example: 'conv_123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Unique conversion reference',
    example: 'CONV-20250105-ABC123',
  })
  reference: string;

  @ApiProperty({
    description: 'Source currency',
    example: 'NGN',
  })
  fromCurrency: string;

  @ApiProperty({
    description: 'Target currency',
    example: 'USDC',
  })
  toCurrency: string;

  @ApiProperty({
    description: 'Original amount',
    example: 25000,
  })
  amount: number;

  @ApiProperty({
    description: 'Converted amount received',
    example: 15.5,
  })
  convertedAmount: number;

  @ApiProperty({
    description: 'Exchange rate used',
    example: 1610,
  })
  exchangeRate: number;

  @ApiProperty({
    description: 'Transaction fee charged',
    example: 200,
  })
  feeAmount: number;

  @ApiProperty({
    description: 'Fee currency',
    example: 'NGN',
  })
  feeCurrency: string;

  @ApiProperty({
    description: 'Transaction status',
    example: 'COMPLETED',
  })
  status: string;

  @ApiProperty({
    description: 'Conversion timestamp',
    example: '2025-01-05T12:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'User ID who performed the conversion',
    example: 'user_123',
  })
  userId: string;
}

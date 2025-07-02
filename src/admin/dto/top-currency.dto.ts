import { ApiProperty } from '@nestjs/swagger';

export class TopCurrencyDto {
  @ApiProperty({ description: 'Currency ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Currency name', example: 'US Dollar' })
  name: string;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  code: string;

  @ApiProperty({ description: 'Number of transactions in this currency', example: 1500 })
  transactionCount: number;

  @ApiProperty({ description: 'Total volume transacted in this currency', example: 1000000.5 })
  totalVolume: number;
}
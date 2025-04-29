import { ApiProperty } from '@nestjs/swagger';

export class TopCurrencyDto {
  @ApiProperty({ description: 'Currency ID' })
  id: number;

  @ApiProperty({ description: 'Currency name' })
  name: string;

  @ApiProperty({ description: 'Currency code' })
  code: string;

  @ApiProperty({ description: 'Number of transactions in this currency' })
  transactionCount: number;

  @ApiProperty({ description: 'Total volume transacted in this currency' })
  totalVolume: number;
}
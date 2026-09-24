import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ example: 'EUR' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({ example: '100' })
  @IsNotEmpty()
  fromAmount: string | number;
}

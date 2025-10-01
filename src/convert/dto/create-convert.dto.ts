import {
  IsString,
  IsNumber,
  IsPositive,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsSupportedCurrency } from 'src/currencies/validators/supported-currency.validator';

export class CreateConvertDto {
  @ApiProperty({
    description: 'Source currency code',
    example: 'NGN',
    enum: ['NGN', 'USD'],
  })
  @IsString()
  @IsNotEmpty()
  @IsSupportedCurrency()
  fromCurrency: string;

  @ApiProperty({
    description: 'Target currency code',
    example: 'USD',
    enum: ['NGN', 'USD'],
  })
  @IsString()
  @IsNotEmpty()
  @IsSupportedCurrency()
  toCurrency: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 25000,
    minimum: 0.01,
  })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({
    description: 'Optional description for the conversion',
    example: 'Converting NGN to USD for trading',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}

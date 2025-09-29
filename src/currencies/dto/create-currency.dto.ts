import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsUrl,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrencyType } from '../enum/currencyType.enum';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3,10}$/, { message: 'Code must be 3-10 uppercase letters' })
  code: string;

  @ApiProperty({ example: 'US Dollar' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '$' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(8)
  decimalPlaces: number;

  @ApiProperty({ enum: CurrencyType, example: CurrencyType.FIAT })
  @IsEnum(CurrencyType)
  type: CurrencyType;

  @ApiPropertyOptional({ example: 1.0 })
  @IsOptional()
  exchangeRate?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}

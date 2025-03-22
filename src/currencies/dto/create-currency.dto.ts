import { IsEnum, IsNotEmpty, IsOptional, IsString, IsInt, Min, Max, IsBoolean, IsUrl, IsUUID, Matches } from 'class-validator';
import { CurrencyType } from '../enum/currencyType.enum';

export class CreateCurrencyDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3,10}$/, { message: 'Code must be 3-10 uppercase letters' })
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;

  @IsInt()
  @Min(0)
  @Max(8)
  decimalPlaces: number;

  @IsEnum(CurrencyType)
  type: CurrencyType;

  @IsOptional()
  exchangeRate?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsString()
  @IsOptional()
  @IsUrl()
  logoUrl?: string;
}

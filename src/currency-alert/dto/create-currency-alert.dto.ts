// src/currency-alerts/dto/create-currency-alert.dto.ts
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { AlertDirection } from './alert-direction.enum';

export class CreateCurrencyAlertDto {
  @IsString()
  @IsNotEmpty()
  baseCurrency: string;

  @IsString()
  @IsNotEmpty()
  targetCurrency: string;

  @IsNumber()
  thresholdRate: number;

  @IsEnum(AlertDirection)
  direction: AlertDirection;
}

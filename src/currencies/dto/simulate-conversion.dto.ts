import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { IsSupportedCurrency } from '../validators/supported-currency.validator';

export class SimulateConversionDto {
  @IsNotEmpty()
  @IsString()
  @IsSupportedCurrency()
  fromCurrency: string;

  @IsNotEmpty()
  @IsString()
  @IsSupportedCurrency()
  toCurrency: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;
}

export class ConversionSimulationResponse {
  fromCurrency: string;
  toCurrency: string;
  inputAmount: number;
  outputAmount: number;
  exchangeRate: number;
  fees: {
    amount: number;
    percentage: number;
  };
  timestamp: Date;
  rateLockExpiresAt?: Date;
}

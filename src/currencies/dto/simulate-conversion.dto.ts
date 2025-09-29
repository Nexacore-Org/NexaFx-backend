import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class SimulateConversionDto {
  @IsNotEmpty()
  @IsString()
  fromCurrency: string;

  @IsNotEmpty()
  @IsString()
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

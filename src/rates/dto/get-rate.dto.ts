import { IsString, IsNotEmpty, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class GetRateDto {
  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  target: string;

  @IsOptional()
  @IsPositive()
  @IsNotEmpty()
  @Type(() => Number)
  // Amount in source currency (must be positive if provided)
  amount?: number;
}

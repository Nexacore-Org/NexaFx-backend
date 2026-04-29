import { IsString, IsNumberString, IsIn, IsBoolean, IsOptional } from 'class-validator';
import { RateAlertDirection } from '../entities/rate-alert.entity';

export class CreateRateAlertDto {
  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  // Accept numeric string to avoid JS float issues at the boundary
  @IsNumberString()
  targetRate: string;

  @IsIn([RateAlertDirection.ABOVE, RateAlertDirection.BELOW])
  direction: RateAlertDirection;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RateAlertCondition } from '../entities/rate-alert.entity';

export class CreateRateAlertDto {
  @ApiProperty({ example: 'USD', description: 'Source currency code' })
  @IsString()
  @Length(3, 10)
  fromCurrency: string;

  @ApiProperty({ example: 'NGN', description: 'Target currency code' })
  @IsString()
  @Length(3, 10)
  toCurrency: string;

  @ApiProperty({
    example: 1600,
    description: 'Target rate threshold that will trigger the alert',
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  targetRate: number;

  @ApiProperty({ enum: RateAlertCondition, example: RateAlertCondition.ABOVE })
  @IsEnum(RateAlertCondition)
  condition: RateAlertCondition;

  @ApiPropertyOptional({
    example: false,
    description: 'If true, alert will auto-reactivate 24 hours after trigger',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;
}

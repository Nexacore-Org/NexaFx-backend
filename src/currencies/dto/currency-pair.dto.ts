import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CURRENCY_CODE_REGEX = /^[A-Za-z0-9]{2,10}$/;

@ValidatorConstraint({ name: 'MinLessOrEqualMax', async: false })
export class MinLessOrEqualMaxConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as {
      minAmountUsd?: number | null;
      maxAmountUsd?: number | null;
    };
    if (
      obj.minAmountUsd !== undefined &&
      obj.minAmountUsd !== null &&
      obj.maxAmountUsd !== undefined &&
      obj.maxAmountUsd !== null
    ) {
      return Number(obj.minAmountUsd) <= Number(obj.maxAmountUsd);
    }
    return true;
  }

  defaultMessage(): string {
    return 'minAmountUsd must be less than or equal to maxAmountUsd';
  }
}

export class CreateCurrencyPairDto {
  @ApiProperty({ example: 'XLM' })
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, {
    message: 'fromCurrencyCode must be 2 to 10 alphanumeric characters',
  })
  fromCurrencyCode: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, {
    message: 'toCurrencyCode must be 2 to 10 alphanumeric characters',
  })
  toCurrencyCode: string;

  @ApiPropertyOptional({ example: 0.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  spreadPercent?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmountUsd?: number;

  @ApiPropertyOptional({ example: 10000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MinLessOrEqualMaxConstraint)
  maxAmountUsd?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCurrencyPairDto {
  @ApiPropertyOptional({ example: 'XLM' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, {
    message: 'fromCurrencyCode must be 2 to 10 alphanumeric characters',
  })
  fromCurrencyCode?: string;

  @ApiPropertyOptional({ example: 'NGN' })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY_CODE_REGEX, {
    message: 'toCurrencyCode must be 2 to 10 alphanumeric characters',
  })
  toCurrencyCode?: string;

  @ApiPropertyOptional({ example: 0.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  spreadPercent?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmountUsd?: number;

  @ApiPropertyOptional({ example: 10000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(MinLessOrEqualMaxConstraint)
  maxAmountUsd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SuspendPairDto {
  @ApiProperty({ description: 'Reason for suspending the trading pair' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    description: 'ISO 8601 duration or future ISO timestamp (e.g. PT1H)',
    example: 'PT1H',
  })
  @IsString()
  @IsNotEmpty()
  duration: string;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
const uppercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

@ValidatorConstraint({ name: 'minAmountUsdNotAboveMaxAmountUsd', async: false })
class MinAmountNotAboveMaxAmount implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { minAmountUsd, maxAmountUsd } = args.object as {
      minAmountUsd?: number;
      maxAmountUsd?: number;
    };
    if (minAmountUsd == null || maxAmountUsd == null) return true;
    return Number(minAmountUsd) <= Number(maxAmountUsd);
  }

  defaultMessage(): string {
    return 'minAmountUsd must be less than or equal to maxAmountUsd';
  }
}

export class CreateCurrencyPairDto {
  @ApiProperty({ example: 'XLM' })
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN)
  @Transform(uppercase)
  fromCurrencyCode: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  @Matches(CURRENCY_CODE_PATTERN)
  @Transform(uppercase)
  toCurrencyCode: string;

  @ApiPropertyOptional({ example: 0.5, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  spreadPercent?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Validate(MinAmountNotAboveMaxAmount)
  minAmountUsd?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmountUsd?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCurrencyPairDto extends PartialType(CreateCurrencyPairDto) {}

export class SuspendPairDto {
  @ApiProperty({ example: 'Suspicious activity' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ example: 'PT1H' })
  @IsString()
  @Matches(/^PT(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+S)?$/)
  duration: string;
}

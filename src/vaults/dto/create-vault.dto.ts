import {
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsIn,
  IsPositive,
  MaxLength,
  MinLength,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AutoDepositFrequency } from '../enum/auto-deposit-frequency.enum';
import { ApiProperty } from '@nestjs/swagger';

export const SUPPORTED_VAULT_CURRENCIES = [
  'NGN',
  'USD',
  'EUR',
  'GBP',
  'GHS',
  'KES',
  'ZAR',
  'XLM',
  'USDC',
  'BTC',
  'ETH',
] as const;

export type SupportedVaultCurrency =
  (typeof SUPPORTED_VAULT_CURRENCIES)[number];

export const MAX_VAULT_TERM_DAYS = 365 * 5;

export function IsFutureVaultUnlockDate(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureVaultUnlockDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' && !(value instanceof Date)) {
            return false;
          }
          const parsed = new Date(value);
          const nowMs = Date.now();
          if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= nowMs) {
            return false;
          }
          const maxMs = nowMs + MAX_VAULT_TERM_DAYS * 24 * 60 * 60 * 1000;
          return parsed.getTime() <= maxMs;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a future date within ${MAX_VAULT_TERM_DAYS} days`;
        },
      },
    });
  };
}

export class CreateVaultDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: SUPPORTED_VAULT_CURRENCIES })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn(SUPPORTED_VAULT_CURRENCIES)
  currency: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  targetAmount: number;

  @ApiProperty()
  @IsDateString()
  @IsFutureVaultUnlockDate()
  unlockAt: string | Date;

  @ApiProperty({ required: false })
  @ValidateIf(
    (o: CreateVaultDto) =>
      (o.autoDepositAmount !== undefined && o.autoDepositAmount !== null) ||
      (o.autoDepositFrequency !== undefined && o.autoDepositFrequency !== null),
  )
  @IsNumber()
  @IsPositive()
  autoDepositAmount?: number;

  @ApiProperty({ required: false, enum: AutoDepositFrequency })
  @ValidateIf(
    (o: CreateVaultDto) =>
      (o.autoDepositFrequency !== undefined &&
        o.autoDepositFrequency !== null) ||
      (o.autoDepositAmount !== undefined && o.autoDepositAmount !== null),
  )
  @IsEnum(AutoDepositFrequency)
  autoDepositFrequency?: AutoDepositFrequency;
}

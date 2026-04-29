import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FeeType } from '../../fees/entities/fee-config.entity';

export class UpdatePlatformFeeConfigDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxFee?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSupportedCurrencyDto {
  @IsString()
  @MaxLength(10)
  code: string;

  @IsBoolean()
  isActive: boolean;
}

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePlatformFeeConfigDto)
  feeConfigs?: UpdatePlatformFeeConfigDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSupportedCurrencyDto)
  currencies?: UpdateSupportedCurrencyDto[];
}

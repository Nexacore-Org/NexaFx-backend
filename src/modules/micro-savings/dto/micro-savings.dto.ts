import { IsUUID, IsEnum, IsNumber, IsOptional, IsBoolean, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MicroSavingsTriggerType } from '../entities/micro-savings-rule.entity';

class PerTransactionConfigDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  minTransactionAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  savePercent?: number;
}

class BalanceThresholdConfigDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  thresholdAmount?: number;

  @IsBoolean()
  @IsOptional()
  saveExcess?: boolean;
}

export class CreateMicroSavingsRuleDto {
  @IsUUID()
  targetVaultId: string;

  @IsEnum(MicroSavingsTriggerType)
  triggerType: MicroSavingsTriggerType;

  @IsNumber()
  @Min(0)
  saveAmount: number;

  @ValidateNested()
  @Type(() => PerTransactionConfigDto)
  @IsOptional()
  perTransactionConfig?: PerTransactionConfigDto;

  @ValidateNested()
  @Type(() => BalanceThresholdConfigDto)
  @IsOptional()
  balanceThresholdConfig?: BalanceThresholdConfigDto;

  @IsNumber()
  @Min(0)
  maxDailyContribution: number;
}

export class UpdateMicroSavingsRuleDto {
  @IsUUID()
  @IsOptional()
  targetVaultId?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  saveAmount?: number;

  @ValidateNested()
  @Type(() => PerTransactionConfigDto)
  @IsOptional()
  perTransactionConfig?: PerTransactionConfigDto;

  @ValidateNested()
  @Type(() => BalanceThresholdConfigDto)
  @IsOptional()
  balanceThresholdConfig?: BalanceThresholdConfigDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxDailyContribution?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RebalanceFrequency } from '../entities/rebalancing-policy.entity';

export class TargetAllocationDto {
  @IsString()
  currency: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  targetPercent: number;
}

export class CreateOrUpdatePolicyDto {
  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TargetAllocationDto)
  allocations: TargetAllocationDto[];

  @IsInt()
  @Min(1)
  @Max(50)
  driftThresholdPercent: number;

  @IsEnum(RebalanceFrequency)
  frequency: RebalanceFrequency;
}
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type FraudPatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudPatternAction = 'FLAG' | 'BLOCK' | 'REQUIRE_REVIEW';
export type FraudConditionOp =
  'EQUALS' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'CONTAINS';

export class FraudPatternCondition {
  @IsString()
  @IsNotEmpty()
  field: string;

  @IsEnum(['EQUALS', 'GT', 'LT', 'GTE', 'LTE', 'CONTAINS'])
  op: FraudConditionOp;

  value: string | number | boolean;
}

export class CreateFraudPatternDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity: FraudPatternSeverity;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FraudPatternCondition)
  conditions: FraudPatternCondition[];

  @IsEnum(['FLAG', 'BLOCK', 'REQUIRE_REVIEW'])
  action: FraudPatternAction;
}

export class UpdateFraudPatternDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: FraudPatternSeverity;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FraudPatternCondition)
  conditions?: FraudPatternCondition[];

  @IsOptional()
  @IsEnum(['FLAG', 'BLOCK', 'REQUIRE_REVIEW'])
  action?: FraudPatternAction;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestFraudPatternDto {
  @IsString()
  @IsNotEmpty()
  patternId: string;

  @IsObject()
  transactionScenario: Record<string, string | number | boolean>;
}

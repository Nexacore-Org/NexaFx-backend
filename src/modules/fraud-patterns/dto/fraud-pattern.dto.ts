export type FraudPatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudPatternAction = 'FLAG' | 'BLOCK' | 'REQUIRE_REVIEW';
export type FraudConditionOp = 'EQUALS' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'CONTAINS';

export class FraudPatternCondition {
  field: string;
  op: FraudConditionOp;
  value: string | number | boolean;
}

export class CreateFraudPatternDto {
  name: string;
  description: string;
  severity: FraudPatternSeverity;
  conditions: FraudPatternCondition[];
  action: FraudPatternAction;
}

export class UpdateFraudPatternDto {
  name?: string;
  description?: string;
  severity?: FraudPatternSeverity;
  conditions?: FraudPatternCondition[];
  action?: FraudPatternAction;
  isActive?: boolean;
}

export class TestFraudPatternDto {
  patternId: string;
  transactionScenario: Record<string, string | number | boolean>;
}

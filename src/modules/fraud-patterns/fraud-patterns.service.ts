import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateFraudPatternDto,
  FraudPatternCondition,
  UpdateFraudPatternDto,
} from './dto/fraud-pattern.dto';

export interface FraudPattern extends CreateFraudPatternDto {
  id: string;
  triggerCount: number;
  lastTriggeredAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FraudPatternMatch {
  patternId: string;
  name: string;
  severity: string;
  action: string;
}

const DEFAULT_PATTERNS: CreateFraudPatternDto[] = [
  {
    name: 'High-value new account',
    description: 'Amount > 5000 USD on an account less than 7 days old',
    severity: 'HIGH',
    action: 'REQUIRE_REVIEW',
    conditions: [
      { field: 'amountUsd', op: 'GT', value: 5000 },
      { field: 'accountAgeDays', op: 'LT', value: 7 },
    ],
  },
  {
    name: 'Unusual hours',
    description: 'Transaction submitted between 01:00 and 04:00 UTC',
    severity: 'LOW',
    action: 'FLAG',
    conditions: [{ field: 'hourUtc', op: 'GTE', value: 1 }],
  },
  {
    name: 'Rapid successive sends',
    description: '5 or more transactions in the last 30 minutes',
    severity: 'MEDIUM',
    action: 'FLAG',
    conditions: [{ field: 'txCountLast30Min', op: 'GTE', value: 5 }],
  },
  {
    name: 'Round-number sends',
    description: 'Amount is an exact round number greater than 1000',
    severity: 'LOW',
    action: 'FLAG',
    conditions: [{ field: 'isRoundAmount', op: 'EQUALS', value: true }],
  },
  {
    name: 'New country + high value',
    description: 'New country flag with amount over 2000 USD',
    severity: 'HIGH',
    action: 'REQUIRE_REVIEW',
    conditions: [
      { field: 'isNewCountry', op: 'EQUALS', value: true },
      { field: 'amountUsd', op: 'GT', value: 2000 },
    ],
  },
];

/**
 * In-memory fraud pattern library. Persists for the lifetime of the process
 * only — a small, self-contained scaffold rather than a full DB-backed
 * implementation.
 */
@Injectable()
export class FraudPatternsService {
  private patterns = new Map<string, FraudPattern>();

  constructor() {
    for (const seed of DEFAULT_PATTERNS) {
      this.create(seed);
    }
  }

  create(dto: CreateFraudPatternDto): FraudPattern {
    const now = new Date();
    const pattern: FraudPattern = {
      ...dto,
      id: randomUUID(),
      triggerCount: 0,
      lastTriggeredAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  findAll(): FraudPattern[] {
    return Array.from(this.patterns.values());
  }

  update(id: string, dto: UpdateFraudPatternDto): FraudPattern {
    const existing = this.patterns.get(id);
    if (!existing) {
      throw new NotFoundException(`Fraud pattern ${id} not found`);
    }
    const updated: FraudPattern = {
      ...existing,
      ...dto,
      updatedAt: new Date(),
    };
    this.patterns.set(id, updated);
    return updated;
  }

  deactivate(id: string): FraudPattern {
    return this.update(id, { isActive: false });
  }

  /** Evaluates every active pattern against a transaction; returns matches. */
  evaluate(
    transaction: Record<string, string | number | boolean>,
  ): FraudPatternMatch[] {
    const matches: FraudPatternMatch[] = [];

    for (const pattern of this.patterns.values()) {
      if (!pattern.isActive) continue;

      const allConditionsMet = pattern.conditions.every((condition) =>
        this.evaluateCondition(condition, transaction),
      );

      if (allConditionsMet) {
        pattern.triggerCount += 1;
        pattern.lastTriggeredAt = new Date();
        matches.push({
          patternId: pattern.id,
          name: pattern.name,
          severity: pattern.severity,
          action: pattern.action,
        });
      }
    }

    return matches;
  }

  /** Dry-runs a pattern's conditions against a hypothetical transaction. */
  test(
    patternId: string,
    transactionScenario: Record<string, string | number | boolean>,
  ): {
    matched: boolean;
    conditions: Array<FraudPatternCondition & { result: boolean }>;
  } {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      throw new NotFoundException(`Fraud pattern ${patternId} not found`);
    }

    const conditions = pattern.conditions.map((condition) => ({
      ...condition,
      result: this.evaluateCondition(condition, transactionScenario),
    }));

    return {
      matched: conditions.every((c) => c.result),
      conditions,
    };
  }

  private evaluateCondition(
    condition: FraudPatternCondition,
    transaction: Record<string, string | number | boolean>,
  ): boolean {
    const actual = transaction[condition.field];
    if (actual === undefined) return false;

    switch (condition.op) {
      case 'EQUALS':
        return actual === condition.value;
      case 'GT':
        return Number(actual) > Number(condition.value);
      case 'LT':
        return Number(actual) < Number(condition.value);
      case 'GTE':
        return Number(actual) >= Number(condition.value);
      case 'LTE':
        return Number(actual) <= Number(condition.value);
      case 'CONTAINS':
        return String(actual).includes(String(condition.value));
      default:
        return false;
    }
  }
}

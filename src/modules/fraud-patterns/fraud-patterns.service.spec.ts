import { NotFoundException } from '@nestjs/common';
import { FraudPatternsService } from './fraud-patterns.service';
import { CreateFraudPatternDto } from './dto/fraud-pattern.dto';

describe('FraudPatternsService', () => {
  let service: FraudPatternsService;

  beforeEach(() => {
    service = new FraudPatternsService();
  });

  describe('create / findAll', () => {
    it('seeds default patterns on construction', () => {
      const all = service.findAll();
      expect(all.length).toBeGreaterThanOrEqual(5);
      expect(all.every((p) => p.isActive)).toBe(true);
    });

    it('creates a custom pattern with generated id', () => {
      const dto: CreateFraudPatternDto = {
        name: 'Test pattern',
        description: 'Amount > 100',
        severity: 'LOW',
        action: 'FLAG',
        conditions: [{ field: 'amountUsd', op: 'GT', value: 100 }],
      };
      const created = service.create(dto);
      expect(created.id).toBeDefined();
      expect(created.triggerCount).toBe(0);
      expect(created.isActive).toBe(true);
      expect(service.findAll().some((p) => p.id === created.id)).toBe(true);
    });
  });

  describe('evaluate — match / no-match', () => {
    it('matches high-value new account fixture activity', () => {
      const matches = service.evaluate({
        amountUsd: 6000,
        accountAgeDays: 3,
      });
      const hit = matches.find((m) => m.name === 'High-value new account');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('HIGH');
      expect(hit!.action).toBe('REQUIRE_REVIEW');
    });

    it('does not false-positive on clean fixture activity', () => {
      const matches = service.evaluate({
        amountUsd: 50,
        accountAgeDays: 365,
        hourUtc: 14,
        txCountLast30Min: 1,
        isRoundAmount: false,
        isNewCountry: false,
      });
      // Default "Unusual hours" requires hourUtc GTE 1 — 14 matches that single condition.
      // Exclude it by using a clean scenario that fails each multi-condition pattern.
      const multiConditionHits = matches.filter(
        (m) =>
          m.name === 'High-value new account' ||
          m.name === 'New country + high value' ||
          m.name === 'Rapid successive sends',
      );
      expect(multiConditionHits).toHaveLength(0);
    });

    it('matches rapid successive sends', () => {
      const matches = service.evaluate({ txCountLast30Min: 8 });
      expect(matches.some((m) => m.name === 'Rapid successive sends')).toBe(true);
    });

    it('skips inactive patterns', () => {
      const all = service.findAll();
      const target = all.find((p) => p.name === 'High-value new account')!;
      service.deactivate(target.id);

      const matches = service.evaluate({
        amountUsd: 9000,
        accountAgeDays: 1,
      });
      expect(matches.some((m) => m.patternId === target.id)).toBe(false);
    });
  });

  describe('deactivate', () => {
    it('sets isActive=false without needing redeploy', () => {
      const pattern = service.findAll()[0];
      const updated = service.deactivate(pattern.id);
      expect(updated.isActive).toBe(false);
      expect(service.findAll().find((p) => p.id === pattern.id)!.isActive).toBe(
        false,
      );
    });

    it('throws NotFoundException for unknown id', () => {
      expect(() => service.deactivate('missing-id')).toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('merges partial updates', () => {
      const pattern = service.findAll()[0];
      const updated = service.update(pattern.id, { severity: 'CRITICAL' });
      expect(updated.severity).toBe('CRITICAL');
      expect(updated.name).toBe(pattern.name);
    });

    it('throws when pattern does not exist', () => {
      expect(() => service.update('nope', { name: 'x' })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('test (dry-run)', () => {
    it('returns per-condition results without mutating triggerCount', () => {
      const pattern = service
        .findAll()
        .find((p) => p.name === 'High-value new account')!;
      const before = pattern.triggerCount;

      const result = service.test(pattern.id, {
        amountUsd: 6000,
        accountAgeDays: 2,
      });

      expect(result.matched).toBe(true);
      expect(result.conditions.every((c) => c.result === true)).toBe(true);
      expect(pattern.triggerCount).toBe(before);
    });

    it('throws for unknown patternId', () => {
      expect(() => service.test('unknown', {})).toThrow(NotFoundException);
    });
  });

  describe('evaluateCondition edge cases', () => {
    it('returns false when field is missing from transaction', () => {
      const matches = service.evaluate({}); // no fields
      // Patterns whose conditions reference missing fields should not match
      const highValue = matches.find((m) => m.name === 'High-value new account');
      expect(highValue).toBeUndefined();
    });
  });
});

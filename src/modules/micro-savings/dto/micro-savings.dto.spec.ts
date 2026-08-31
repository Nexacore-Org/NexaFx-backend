import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMicroSavingsRuleDto, UpdateMicroSavingsRuleDto } from './micro-savings.dto';
import { MicroSavingsTriggerType } from '../entities/micro-savings-rule.entity';

describe('micro-savings.dto validation', () => {
  const validCreate = {
    targetVaultId: '11111111-1111-1111-1111-111111111111',
    triggerType: MicroSavingsTriggerType.PER_TRANSACTION,
    saveAmount: 1,
    maxDailyContribution: 25,
    perTransactionConfig: { minTransactionAmount: 5, savePercent: 10 },
  };

  it('accepts a valid create payload', async () => {
    const dto = plainToInstance(CreateMicroSavingsRuleDto, validCreate);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative saveAmount (invalid contribution rule)', async () => {
    const dto = plainToInstance(CreateMicroSavingsRuleDto, {
      ...validCreate,
      saveAmount: -5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const saveAmountError = errors.find((e) => e.property === 'saveAmount');
    expect(saveAmountError).toBeDefined();
    expect(JSON.stringify(saveAmountError?.constraints)).toMatch(/min/i);
  });

  it('rejects a negative maxDailyContribution', async () => {
    const dto = plainToInstance(CreateMicroSavingsRuleDto, {
      ...validCreate,
      maxDailyContribution: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'maxDailyContribution')).toBe(true);
  });

  it('rejects negative minTransactionAmount in nested config', async () => {
    const dto = plainToInstance(CreateMicroSavingsRuleDto, {
      ...validCreate,
      perTransactionConfig: { minTransactionAmount: -10, savePercent: 5 },
    });
    const errors = await validate(dto);
    // nested validation
    const nested = errors.find((e) => e.property === 'perTransactionConfig');
    expect(nested).toBeDefined();
  });

  it('rejects invalid triggerType enum', async () => {
    const dto = plainToInstance(CreateMicroSavingsRuleDto, {
      ...validCreate,
      triggerType: 'NOT_A_REAL_TRIGGER',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'triggerType')).toBe(true);
  });

  it('UpdateMicroSavingsRuleDto rejects negative saveAmount', async () => {
    const dto = plainToInstance(UpdateMicroSavingsRuleDto, { saveAmount: -0.01 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'saveAmount')).toBe(true);
  });

  it('UpdateMicroSavingsRuleDto allows isActive: false', async () => {
    const dto = plainToInstance(UpdateMicroSavingsRuleDto, { isActive: false });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateExperimentDto, CreateVariantDto } from './create-experiment.dto';

describe('CreateExperimentDto', () => {
  const validDto = {
    key: 'checkout-flow',
    name: 'Checkout Flow Test',
    description: 'Testing new checkout',
    trafficPercent: 100,
    variants: [
      { key: 'control', name: 'Control', weight: 50 },
      { key: 'treatment', name: 'Treatment', weight: 50 },
    ],
  };

  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CreateExperimentDto, validDto);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when key is empty', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      key: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('should fail when name is empty', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      name: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail when variants array is empty', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      variants: [],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'variants')).toBe(true);
  });

  it('should fail when trafficPercent exceeds 100', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      trafficPercent: 150,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when trafficPercent is negative', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      trafficPercent: -10,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass when trafficPercent is omitted (optional)', async () => {
    const { trafficPercent, ...dtoWithoutTraffic } = validDto;
    const dto = plainToInstance(CreateExperimentDto, dtoWithoutTraffic);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass when description is omitted (optional)', async () => {
    const { description, ...dtoWithoutDesc } = validDto;
    const dto = plainToInstance(CreateExperimentDto, dtoWithoutDesc);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when variant key is empty', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      variants: [{ key: '', name: 'Control', weight: 50 }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when variant weight is negative', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      variants: [{ key: 'a', name: 'A', weight: -1 }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when key exceeds max length', async () => {
    const dto = plainToInstance(CreateExperimentDto, {
      ...validDto,
      key: 'a'.repeat(256),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateVariantDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      key: 'control',
      name: 'Control Variant',
      weight: 50,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with optional config', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      key: 'treatment',
      name: 'Treatment',
      weight: 50,
      config: { color: 'red', size: 'large' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when weight is not an integer', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      key: 'a',
      name: 'A',
      weight: 1.5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when weight is below 0', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      key: 'a',
      name: 'A',
      weight: -1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

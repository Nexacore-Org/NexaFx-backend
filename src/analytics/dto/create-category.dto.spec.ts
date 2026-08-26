import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';
import { TransactionCategoryColor } from '../entities/transaction-category.entity';

describe('CreateCategoryDto', () => {
  let pipe: ValidationPipe;

  beforeEach(async () => {
    const module = await Test.createTestingModule({}).compile();
    pipe = module.get(ValidationPipe);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fail validation when name is empty', async () => {
    const dto = new CreateCategoryDto();
    dto.name = '';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should fail validation when name is too long', async () => {
    const dto = new CreateCategoryDto();
    dto.name = 'a'.repeat(101);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('should pass validation with valid name and color', async () => {
    const dto = new CreateCategoryDto();
    dto.name = 'Groceries';
    dto.color = TransactionCategoryColor.GREEN;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with valid name and no color', async () => {
    const dto = new CreateCategoryDto();
    dto.name = 'Groceries';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when color is not a valid enum value', async () => {
    const dto = new CreateCategoryDto();
    dto.name = 'Groceries';
    dto.color = 'INVALID_COLOR' as TransactionCategoryColor;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

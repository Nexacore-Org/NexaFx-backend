import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { AssignCategoryDto } from './assign-category.dto';

describe('AssignCategoryDto', () => {
  let pipe: ValidationPipe;

  beforeEach(async () => {
    const module = await Test.createTestingModule({}).compile();
    pipe = module.get(ValidationPipe);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fail validation when transactionId is missing', async () => {
    const dto = new AssignCategoryDto();
    dto.transactionId = '';
    dto.categoryId = 'cat-1';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'transactionId')).toBe(true);
  });

  it('should fail validation when categoryId is missing', async () => {
    const dto = new AssignCategoryDto();
    dto.transactionId = 'tx-1';
    dto.categoryId = '';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('should fail validation when both fields are missing', async () => {
    const dto = new AssignCategoryDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(2);
    expect(errors.some((e) => e.property === 'transactionId')).toBe(true);
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('should pass validation with both ids provided', async () => {
    const dto = new AssignCategoryDto();
    dto.transactionId = 'tx-1';
    dto.categoryId = 'cat-1';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

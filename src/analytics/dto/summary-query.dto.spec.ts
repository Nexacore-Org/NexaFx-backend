import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { validate } from 'class-validator';
import { SummaryQueryDto } from './summary-query.dto';

describe('SummaryQueryDto', () => {
  let pipe: ValidationPipe;

  beforeEach(async () => {
    const module = await Test.createTestingModule({}).compile();
    pipe = module.get(ValidationPipe);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass validation with no fields', async () => {
    const dto = new SummaryQueryDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with valid date strings', async () => {
    const dto = new SummaryQueryDto();
    dto.startDate = '2024-01-01';
    dto.endDate = '2024-01-31';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with categoryId', async () => {
    const dto = new SummaryQueryDto();
    dto.categoryId = 'cat-1';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with invalid date strings', async () => {
    const dto = new SummaryQueryDto();
    dto.startDate = 'not-a-date';
    dto.endDate = 'also-not-a-date';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

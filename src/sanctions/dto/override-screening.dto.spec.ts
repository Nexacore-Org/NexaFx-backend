import { validate } from 'class-validator';
import { OverrideScreeningDto } from './override-screening.dto';

describe('OverrideScreeningDto', () => {
  it('should pass validation with a valid reason', async () => {
    const dto = new OverrideScreeningDto();
    dto.reason = 'This is a valid reason for overriding.';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with a short reason', async () => {
    const dto = new OverrideScreeningDto();
    dto.reason = 'Too short';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('minLength');
  });
});

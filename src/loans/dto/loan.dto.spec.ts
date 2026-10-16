import { validate } from 'class-validator';
import { AdminApproveLoanDto } from './loan.dto';

describe('AdminApproveLoanDto', () => {
  it('accepts an interest rate of 10 percent', async () => {
    const dto = Object.assign(new AdminApproveLoanDto(), {
      approvedAmount: 100,
      interestRatePercent: 10,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects interest rates that exceed the database column range', async () => {
    const dto = Object.assign(new AdminApproveLoanDto(), {
      approvedAmount: 100,
      interestRatePercent: 1000,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'interestRatePercent')).toBe(
      true,
    );
  });
});

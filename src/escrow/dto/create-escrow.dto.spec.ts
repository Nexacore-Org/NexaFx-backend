import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEscrowDto } from './create-escrow.dto';

describe('CreateEscrowDto', () => {
  const validDto = {
    recipientEmail: 'recipient@example.com',
    amount: 10,
    currency: 'XLM',
    title: 'Test escrow',
    description: 'Test escrow description',
    releaseCondition: 'Complete work',
  };

  it.each([0, -1])('rejects non-positive amount %s', async (amount) => {
    const dto = plainToInstance(CreateEscrowDto, { ...validDto, amount });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('amount');
  });

  it('rejects amounts with more than 7 decimal places', async () => {
    const dto = plainToInstance(CreateEscrowDto, {
      ...validDto,
      amount: 1.12345678,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('amount');
  });

  it('only accepts currencies supported by the on-chain escrow flow', async () => {
    const dto = plainToInstance(CreateEscrowDto, {
      ...validDto,
      currency: 'USD',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('currency');
  });

  it('rejects an invalid auto-release date', async () => {
    const dto = plainToInstance(CreateEscrowDto, {
      ...validDto,
      autoReleaseAt: 'not-a-date',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('autoReleaseAt');
  });
});

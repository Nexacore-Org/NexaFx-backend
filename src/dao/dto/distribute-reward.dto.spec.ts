import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DistributeRewardDto } from './distribute-reward.dto';

const validReward = {
  userId: '4a9b5b21-7d6b-4e50-a3aa-a988eb5369a7',
  requestId: '9a598677-3e44-4bc4-8dcb-dcf704c63ca8',
  amount: 10.1234567,
  currency: 'XLM',
};

async function validateReward(payload: Record<string, unknown>) {
  return validate(plainToInstance(DistributeRewardDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('DistributeRewardDto', () => {
  it('accepts a UUID request and user with a positive amount at 7-decimal precision', async () => {
    await expect(validateReward(validReward)).resolves.toHaveLength(0);
  });

  it.each([
    ['invalid user UUID', { userId: 'not-a-uuid' }],
    ['invalid request UUID', { requestId: 'not-a-uuid' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -1 }],
    ['more than 7 decimal places', { amount: 0.00000001 }],
    ['unsupported currency', { currency: 'USD' }],
  ])('rejects %s', async (_description, overrides) => {
    const errors = await validateReward({ ...validReward, ...overrides });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects client-supplied contract invocation fields', async () => {
    const errors = await validateReward({
      ...validReward,
      contractId: 'CAGAKXJ4PKVDG3NB6HVMQXWZQPBQSQXZZZFVBF3RIQAFH2XPZW2JZTY',
      functionName: 'anything',
      args: ['attacker-controlled'],
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['contractId', 'functionName', 'args']),
    );
  });
});

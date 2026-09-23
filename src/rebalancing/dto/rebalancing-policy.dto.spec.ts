import { Test, TestingModule } from '@nestjs/testing';
import {
  CreateOrUpdatePolicyDto,
  TargetAllocationDto,
} from './rebalancing-policy.dto';
import { validate } from 'class-validator';
import { RebalanceFrequency } from '../entities/rebalancing-policy.entity';

describe('CreateOrUpdatePolicyDto', () => {
  it('should pass validation with correct data', async () => {
    const dto = new CreateOrUpdatePolicyDto();
    dto.isActive = true;
    dto.allocations = [{ currency: 'BTC', targetPercent: 100 }];
    dto.driftThresholdPercent = 10;
    dto.frequency = RebalanceFrequency.MONTHLY;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation if allocations array is empty', async () => {
    const dto = new CreateOrUpdatePolicyDto();
    dto.isActive = true;
    dto.allocations = [];
    dto.driftThresholdPercent = 10;
    dto.frequency = RebalanceFrequency.MONTHLY;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('arrayMinSize');
  });

  it('should fail validation if driftThresholdPercent is out of range', async () => {
    const dto = new CreateOrUpdatePolicyDto();
    dto.isActive = true;
    dto.allocations = [{ currency: 'BTC', targetPercent: 100 }];
    dto.driftThresholdPercent = 100;
    dto.frequency = RebalanceFrequency.MONTHLY;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('max');
  });
});

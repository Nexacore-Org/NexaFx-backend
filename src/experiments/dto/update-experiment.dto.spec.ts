import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateExperimentDto } from './update-experiment.dto';
import { ExperimentStatus } from '../entities/experiment.entity';

describe('UpdateExperimentDto', () => {
  it('should pass validation with valid status', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {
      status: ExperimentStatus.RUNNING,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with all fields', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {
      name: 'Updated Name',
      description: 'Updated description',
      status: ExperimentStatus.PAUSED,
      trafficPercent: 75,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass validation with no fields (all optional)', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when status is not a valid enum', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {
      status: 'INVALID_STATUS',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when trafficPercent exceeds 100', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {
      trafficPercent: 150,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when trafficPercent is negative', async () => {
    const dto = plainToInstance(UpdateExperimentDto, {
      trafficPercent: -1,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept all valid ExperimentStatus values', async () => {
    const statuses = Object.values(ExperimentStatus);
    for (const status of statuses) {
      const dto = plainToInstance(UpdateExperimentDto, { status });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });
});

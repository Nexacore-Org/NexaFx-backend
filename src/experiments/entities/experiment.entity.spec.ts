import { Experiment, ExperimentStatus } from './experiment.entity';

describe('Experiment entity', () => {
  it('should have all expected ExperimentStatus values', () => {
    expect(ExperimentStatus.DRAFT).toBe('DRAFT');
    expect(ExperimentStatus.RUNNING).toBe('RUNNING');
    expect(ExperimentStatus.PAUSED).toBe('PAUSED');
    expect(ExperimentStatus.CONCLUDED).toBe('CONCLUDED');
  });

  it('should have exactly 4 status values', () => {
    const values = Object.values(ExperimentStatus);
    expect(values).toHaveLength(4);
  });

  it('should create a valid experiment instance', () => {
    const experiment = new Experiment();
    experiment.id = 'exp-1';
    experiment.key = 'checkout-flow';
    experiment.name = 'Checkout Flow';
    experiment.description = 'Testing checkout';
    experiment.status = ExperimentStatus.DRAFT;
    experiment.trafficPercent = 100;
    experiment.variants = [];
    experiment.assignments = [];
    experiment.events = [];

    expect(experiment.id).toBe('exp-1');
    expect(experiment.key).toBe('checkout-flow');
    expect(experiment.status).toBe(ExperimentStatus.DRAFT);
    expect(experiment.trafficPercent).toBe(100);
  });

  it('should have nullable startAt and endAt', () => {
    const experiment = new Experiment();
    expect(experiment.startAt).toBeUndefined();
    expect(experiment.endAt).toBeUndefined();
  });
});

import { ExperimentEvent } from './experiment-event.entity';

describe('ExperimentEvent entity', () => {
  it('should create a valid event instance', () => {
    const event = new ExperimentEvent();
    event.id = 'evt-1';
    event.experimentId = 'exp-1';
    event.assignmentId = 'a-1';
    event.eventName = 'purchase';
    event.metadata = { amount: 99.99, currency: 'USD' };

    expect(event.id).toBe('evt-1');
    expect(event.experimentId).toBe('exp-1');
    expect(event.assignmentId).toBe('a-1');
    expect(event.eventName).toBe('purchase');
    expect(event.metadata).toEqual({ amount: 99.99, currency: 'USD' });
  });

  it('should allow null metadata', () => {
    const event = new ExperimentEvent();
    event.metadata = null as any;
    expect(event.metadata).toBeNull();
  });

  it('should be constructable without arguments', () => {
    const event = new ExperimentEvent();
    expect(event).toBeDefined();
  });
});

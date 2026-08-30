import { ExperimentAssignment } from './experiment-assignment.entity';

describe('ExperimentAssignment entity', () => {
  it('should create a valid assignment instance', () => {
    const assignment = new ExperimentAssignment();
    assignment.id = 'a-1';
    assignment.experimentId = 'exp-1';
    assignment.userId = 'user-42';
    assignment.variantId = 'v-1';

    expect(assignment.id).toBe('a-1');
    expect(assignment.experimentId).toBe('exp-1');
    expect(assignment.userId).toBe('user-42');
    expect(assignment.variantId).toBe('v-1');
  });

  it('should be constructable without arguments', () => {
    const assignment = new ExperimentAssignment();
    expect(assignment).toBeDefined();
  });
});

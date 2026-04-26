import { readFileSync } from 'fs';
import { join } from 'path';

describe('ScheduledJobsModule', () => {
  it('does not import ScheduleModule directly', () => {
    const moduleSource = readFileSync(
      join(__dirname, 'scheduled-jobs.module.ts'),
      'utf8',
    );

    expect(moduleSource).not.toContain('ScheduleModule');
  });
});

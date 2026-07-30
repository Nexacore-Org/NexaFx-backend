import { readFileSync } from 'fs';
import { join } from 'path';

describe('AppModule', () => {
  it('registers ScheduleModule.forRoot() at the application root', () => {
    const moduleSource = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

    expect(moduleSource).toContain('ScheduleModule.forRoot()');
  });
});

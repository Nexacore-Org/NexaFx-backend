import { readFileSync } from 'fs';
import { join } from 'path';

describe('BatchesV2Module', () => {
  it('registers the v2 batch controller', () => {
    const moduleSource = readFileSync(
      join(__dirname, 'batches-v2.module.ts'),
      'utf8',
    );

    expect(moduleSource).toContain("import { BatchesV2Controller } from './batches-v2.controller';");
    expect(moduleSource).toContain('controllers: [BatchesV2Controller]');
  });
});
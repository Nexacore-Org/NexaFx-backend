import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const specPath = resolve(packageRoot, 'openapi.json');
const outputPath = resolve(packageRoot, 'src', 'types', 'generated.ts');
const cliPath = resolve(
  packageRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'openapi-typescript.cmd' : 'openapi-typescript',
);

if (!existsSync(specPath)) {
  console.error(
    'openapi.json is missing. Run `npm run sdk:openapi` from the backend root first.',
  );
  process.exit(1);
}

const result = spawnSync(cliPath, [specPath, '--output', outputPath], {
  cwd: packageRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const scopes = [
  'src/auth/',
  'src/users/',
  'src/two-factor/',
  'src/common/',
].map((p) => p.replace(/\//g, path.sep));

const tscCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(tscCmd, ['tsc', '-p', 'tsconfig.json', '--noEmit', '--pretty', 'false'], {
  encoding: 'utf8',
  cwd: process.cwd(),
});

const output = `${result.stdout || ''}${result.stderr || ''}`;
const lines = output.split(/\r?\n/);
const relevant = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const match = line.match(/^(.+?)\(\d+,\d+\):\s+error\s+TS\d+:/);
  if (match) {
    const file = match[1].replace(/^\.?[\\/]/, '');
    if (scopes.some((s) => file.startsWith(s) || file.includes(`${path.sep}${s}`) || file.includes(s))) {
      relevant.push(line);
      if (i + 1 < lines.length && lines[i + 1] && !lines[i + 1].match(/^.+\(\d+,\d+\):\s+error\s+TS\d+:/)) {
        relevant.push(lines[i + 1]);
      }
    }
  }
}

if (relevant.length > 0) {
  console.error(relevant.join('\n'));
  process.exit(1);
}

if (result.status && !relevant.length) {
  // tsc failed outside scope; report but do not fail this scoped check
  console.log('No semantic errors in scoped paths (tsc reported errors elsewhere).');
  process.exit(0);
}

console.log('No semantic errors in scoped paths.');
process.exit(0);

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextCli = require.resolve('next/dist/bin/next');
const currentOptions = (process.env.NODE_OPTIONS || '').trim();

const env = {
  ...process.env,
  NODE_OPTIONS: [currentOptions, '--max-old-space-size=700'].filter(Boolean).join(' '),
};

const result = spawnSync(process.execPath, [nextCli, 'build', '--webpack'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to launch Next.js build:', result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}

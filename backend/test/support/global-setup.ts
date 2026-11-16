import { execSync } from 'node:child_process';
import './test-env';

/** Applies migrations to the test database once per run. */
export default function globalSetup(): void {
  execSync('pnpm exec drizzle-kit migrate', {
    cwd: `${__dirname}/../..`,
    env: { ...process.env },
    stdio: 'pipe',
  });
}

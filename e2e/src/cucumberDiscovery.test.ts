import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfiguration, loadSupport } from '@cucumber/cucumber/api';
import { afterEach, expect, it, vi } from 'vitest';

const cwd = fileURLToPath(new URL('..', import.meta.url));
afterEach(() => vi.unstubAllEnvs());

it('Cucumber loads runtime steps and support without importing Vitest unit modules', async () => {
  // Loading registers hooks only; this check never runs hooks, browsers or database seeding.
  vi.stubEnv('E2E', process.env.E2E);
  const environment = { cwd, env: { ...process.env, E2E_REPORTS: '0' } };
  const { runConfiguration } = await loadConfiguration({ file: 'cucumber.config.js' }, environment);
  const support = await loadSupport(runConfiguration, environment);
  const files = support.originalCoordinates.requirePaths;
  expect(files.some((file) => file.endsWith('.test.ts'))).toBe(false);
  expect(files).toEqual(
    expect.arrayContaining([
      path.resolve(cwd, 'src/steps/hooks.ts'),
      path.resolve(cwd, 'src/steps/common/auth.steps.ts'),
      path.resolve(cwd, 'src/support/seedTestUser.ts'),
      path.resolve(cwd, 'src/support/world.ts'),
    ]),
  );
});

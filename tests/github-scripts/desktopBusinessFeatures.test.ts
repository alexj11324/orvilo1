// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const check = (env: Record<string, string>) =>
  promisify(execFile)('bun', ['run', 'scripts/electronWorkflow/assertOpenSourceDesktop.ts'], {
    env: { ...process.env, CLOUD_DESKTOP: '', ORVILO_DESKTOP_VITE_CONFIG_EXTENSION: '', ...env },
  });

it('accepts the open-source desktop release configuration', async () => {
  await expect(check({})).resolves.toBeDefined();
});

it.each([
  { CLOUD_DESKTOP: '1' },
  { ORVILO_DESKTOP_VITE_CONFIG_EXTENSION: '/unreviewed/custom-config.ts' },
])('rejects a release override that can enable business features: %o', async (env) => {
  await expect(check(env)).rejects.toMatchObject({ code: 1 });
});

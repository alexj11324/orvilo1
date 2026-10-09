import path from 'node:path';

import { resolveConfig } from 'vite';
import { expect, it } from 'vitest';

it('isolates Electron dependencies from the web authorization server', async () => {
  const desktop = await resolveConfig(
    { configFile: path.resolve('vite.renderer.config.ts') },
    'serve',
    'development',
  );
  const web = await resolveConfig(
    { configFile: path.resolve('../../vite.config.ts'), root: desktop.root },
    'serve',
    'development',
  );

  expect(desktop.root).toBe(web.root);
  expect(desktop.cacheDir).not.toBe(web.cacheDir);
});

// @vitest-environment node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, it } from 'vitest';

it('checks Preview cleanup isolation, certificate identity and metadata permissions', () => {
  const result = spawnSync(process.execPath, [
    '--test', path.join(import.meta.dirname, 'previewFollowup.node.mjs'),
  ], { encoding: 'utf8', timeout: 15_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

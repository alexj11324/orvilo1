// @vitest-environment node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { expect, it } from 'vitest';

it('keeps Preview automation credentials within the explicit origin bootstrap', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types', '--test',
    path.join(import.meta.dirname, 'previewBypass.node.mjs'),
  ], { encoding: 'utf8', timeout: 15_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

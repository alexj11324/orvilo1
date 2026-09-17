// @vitest-environment node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Preview safety executable regressions', () => {
  it('passes the pure migration and CI evidence checks', () => {
    const result = spawnSync(
      process.execPath,
      ['--test', path.join(import.meta.dirname, 'previewAudit.node.mjs')],
      { encoding: 'utf8', timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('preserves remotely existing identity keys without live service access', () => {
    const result = spawnSync(
      'bash',
      [path.join(import.meta.dirname, 'previewIdentitySecrets.test.sh')],
      { encoding: 'utf8', timeout: 15_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

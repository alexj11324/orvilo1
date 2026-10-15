import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('generates an importable signing key and instructs the supported JWKS_KEY variable', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./generate-oidc-jwk.mjs', import.meta.url))],
    { encoding: 'utf8' },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  const { keys } = JSON.parse(result.stdout);
  assert.equal(keys.length, 1);
  assert.equal(createPrivateKey({ key: keys[0], format: 'jwk' }).asymmetricKeyType, 'rsa');
  assert.match(result.stderr, /JWKS_KEY=/);
  assert.doesNotMatch(result.stderr, /OIDC_JWKS_KEY/);
});

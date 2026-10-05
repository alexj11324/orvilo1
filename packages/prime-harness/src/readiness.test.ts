import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PRIME_EMBEDDED_PIN } from '@orvilo/agent-execution/controlPlane/server';
import { afterEach, describe, expect, it } from 'vitest';

import { probePrimeArtifactInstallation } from './readiness';

describe('Prime read-only artifact readiness', () => {
  const temporary: string[] = [];
  afterEach(async () => {
    await Promise.all(temporary.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  const fixture = async (content: string) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'prime-readiness-'));
    temporary.push(dir);
    const artifact = path.join(dir, 'runner.mjs');
    await writeFile(artifact, content);
    await writeFile(
      path.join(dir, 'runner.manifest.json'),
      JSON.stringify({
        artifact: 'runner.mjs',
        bytes: Buffer.byteLength(content),
        prime: PRIME_EMBEDDED_PIN,
        schemaVersion: 1,
        sha256: createHash('sha256').update(content).digest('hex'),
      }),
    );
    return artifact;
  };

  it('verifies a pinned artifact and syntax without executing its body', async () => {
    const artifact = await fixture('throw new Error("Probe must never execute the runner");');
    expect(await probePrimeArtifactInstallation(artifact)).toEqual({ installed: true });
  });

  it('rejects tampered artifacts even when syntax remains valid', async () => {
    const artifact = await fixture('export {};');
    await writeFile(artifact, 'export const tampered = true;');
    expect(await probePrimeArtifactInstallation(artifact)).toEqual({ installed: false });
  });

  it('rejects a hashed but syntactically unusable bundle', async () => {
    const artifact = await fixture('export {');
    expect(await probePrimeArtifactInstallation(artifact)).toEqual({ installed: false });
  });

  it('does not count a missing build as an installed runtime', async () => {
    expect(await probePrimeArtifactInstallation('/missing-prime/runner.mjs')).toEqual({
      installed: false,
    });
  });
});

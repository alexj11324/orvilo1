/** Host-only installation evidence. Never loads runner.ts or opens an Agent session. */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import * as controlPlaneModule from '@orvilo/agent-execution/controlPlane/server';

// agent-execution's source package has no `type: module`: Node exposes it as
// CJS default, while the host bundler exposes named exports. Keep interop at
// this ESM package boundary; remove it when agent-execution publishes ESM.
const { embeddedArtifactVerifier, isEmbeddedArtifactManifest, PRIME_EMBEDDED_PIN } = (
  'default' in controlPlaneModule ? controlPlaneModule.default : controlPlaneModule
) as typeof controlPlaneModule;

export interface PrimeArtifactReadiness {
  installed: boolean | 'unknown';
}

/**
 * Same trusted manifest and upstream pin enforced by embeddedDispatch. Syntax
 * checking loads no runner code, sends no harness.init and invokes no inference.
 * A verified bundle does not attest a device dispatch adapter or supervisor.
 */
export async function probePrimeArtifactInstallation(
  artifact = path.join(import.meta.dirname, '..', 'dist', 'runner.mjs'),
): Promise<PrimeArtifactReadiness> {
  try {
    const manifest: unknown = JSON.parse(
      await readFile(path.join(path.dirname(artifact), 'runner.manifest.json'), 'utf8'),
    );
    if (!isEmbeddedArtifactManifest(manifest)) return { installed: false };
    const verified = await embeddedArtifactVerifier(manifest)(artifact, PRIME_EMBEDDED_PIN);
    if (!verified.ok) return { installed: false };

    // Bun is not the Node 22 executor used by this artifact. Never feed the
    // runner to an executable whose --check semantics have not been verified.
    if (process.versions.bun || Number(process.versions.node.split('.')[0]) < 22)
      return { installed: 'unknown' };
    const valid = await new Promise<boolean | 'unknown'>((resolve) => {
      execFile(
        process.execPath,
        ['--check', artifact],
        {
          env: { ...process.env, ...(process.versions.electron && { ELECTRON_RUN_AS_NODE: '1' }) },
          maxBuffer: 16 * 1024,
          timeout: 1500,
          windowsHide: true,
        },
        (error) => {
          if (!error) return resolve(true);
          // A timeout is missing evidence; a completed syntax check rejected
          // the installed artifact. No stdout/stderr leaves this probe.
          resolve(error.killed ? 'unknown' : false);
        },
      );
    });
    return { installed: valid };
  } catch {
    return { installed: false };
  }
}

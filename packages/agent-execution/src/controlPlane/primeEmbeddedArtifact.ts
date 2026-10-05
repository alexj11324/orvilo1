/**
 * Trusted artifact verification for the embedded runner bundle.
 *
 * `packages/prime-harness/scripts/build.mjs` emits `dist/runner.mjs` plus
 * `dist/runner.manifest.json`. The manifest is host-trusted composition input
 * (committed to the repo or supplied by the operator), never the child's
 * self-report: `embeddedArtifactVerifier` re-hashes the artifact and requires
 * both the digest/length and the upstream provenance to match.
 *
 * For a sha256-pinned supervisor image the immutable image digest and the
 * `orvilo.prime.*`/`orvilo.prime-harness.*` labels already prove the in-image
 * artifact — the same model the ACP prime-agent image uses. This verifier
 * covers the locally built or CI-supplied bundle form of the same pin.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

import { isNonEmptyString, isRecord } from '@orvilo/utils/object';

import type { ControlResult } from './contracts';
import { HARNESS_PROTOCOL_VERSION } from './harnessProtocol';
import type { PrimeEmbeddedRuntimeOptions } from './primeEmbeddedRuntime';

/**
 * The vendored upstream runner identity hosts enforce: any artifact, manifest
 * or session pin claiming different provenance fails admission. Defined here
 * (not in the runtime) so a device-side host can pin it without importing the
 * embedded supervisor stack.
 */
export const PRIME_EMBEDDED_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
  protocol: HARNESS_PROTOCOL_VERSION,
} as const;

/** The `dist/runner.manifest.json` schema `scripts/build.mjs` writes. */
export interface EmbeddedArtifactManifest {
  /** Bundle filename the digest describes (runner.mjs). */
  artifact: string;
  bytes: number;
  /** Vendored upstream provenance — must equal PRIME_EMBEDDED_PIN's fields. */
  prime: { commit: string; license: string; version: string };
  schemaVersion: 1;
  sha256: string;
}

const failure = (message: string): ControlResult<never> => ({
  ok: false,
  error: { code: 'policy_denied', message, retryable: false },
});

export const isEmbeddedArtifactManifest = (value: unknown): value is EmbeddedArtifactManifest => {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (!isNonEmptyString(value.artifact)) return false;
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  if (!Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0) return false;
  const prime = value.prime;
  return (
    isRecord(prime) &&
    isNonEmptyString(prime.commit) &&
    isNonEmptyString(prime.version) &&
    isNonEmptyString(prime.license)
  );
};

/**
 * Compose a `verifyArtifact` against a trusted manifest: the artifact's sha256
 * and byte length must equal the manifest, and the manifest's upstream pin must
 * equal the commit/version/license the runtime enforces. A tampered bundle, a
 * drifted manifest, or an unreadable artifact all deny the launch.
 */
export const embeddedArtifactVerifier =
  (expected: EmbeddedArtifactManifest): PrimeEmbeddedRuntimeOptions['verifyArtifact'] =>
  async (artifact, pin): Promise<ControlResult<true>> => {
    if (!isEmbeddedArtifactManifest(expected))
      return failure('Trusted embedded artifact manifest required');
    if (
      expected.prime.commit !== pin.commit ||
      expected.prime.version !== pin.version ||
      expected.prime.license !== pin.license
    )
      return failure('Embedded artifact manifest does not carry the pinned upstream provenance');
    let content: Buffer;
    let bytes: number;
    try {
      content = await readFile(artifact);
      bytes = (await stat(artifact)).size;
    } catch {
      return failure('Embedded runner artifact is not readable');
    }
    if (bytes !== expected.bytes) return failure('Embedded runner artifact length mismatch');
    if (createHash('sha256').update(content).digest('hex') !== expected.sha256)
      return failure('Embedded runner artifact digest mismatch');
    return { ok: true, value: true };
  };

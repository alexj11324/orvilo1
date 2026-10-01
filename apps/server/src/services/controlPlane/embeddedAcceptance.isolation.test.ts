// @vitest-environment node
/**
 * Phase 6 acceptance — isolation suite.
 *
 * Proves the embedded boundary holds with a REAL dist/runner.mjs child:
 * the trusted artifact verifier hashes the real bundle (match AND tamper),
 * the launch environment carries no endpoint/header/secret material, the
 * runner performs all inference over stdio (netguard --import denies and
 * logs any socket it attempts), and no credential text ever crosses the wire.
 *
 * Docker gap: `realProcessSupervisor` asserts the filesystem/network flags a
 * plain spawn cannot enforce — container-only enforcement is documented in
 * prime-embedded-acceptance.md. The netguard run is instrumentation-level
 * evidence for the same property.
 */
import { randomBytes } from 'node:crypto';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeEvent } from '@orvilo/agent-execution/controlPlane';
import {
  embeddedArtifactVerifier,
  PRIME_EMBEDDED_PIN,
} from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
import { credentials, providerBindings, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture } from './canonicalRun.test-utils';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';
import {
  directoriesFor,
  gate,
  loadRunnerManifest,
  netGuardEnv,
  netGuardNodeArgs,
  readNetGuardLog,
  type RealProcessSupervisor,
  realProcessSupervisor,
  RUNNER_ARTIFACT,
  runnerAvailable,
  sseDelta,
  startStubProvider,
  type StubProvider,
  waitFor,
  type WireFrame,
} from './embeddedAcceptance.support';

const RUNNER_UP = runnerAvailable();
const db: OrviloDatabase = await getTestDB();
const MODEL_ID = 'mock-model-1';
const SECRET_VALUE = 'env-secret-7';

// ScopedFileWriter pins /proc/self/fd traversal — Linux-only; stub the platform
// for open() off-Linux exactly like coreRuntimeHost.embedded.test.ts does.
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

let binding: CanonicalRunBinding | undefined;
let originalSecret: string | undefined;
let provider: StubProvider;
const directories: string[] = [];

const seed = async () => {
  const run = await createCanonicalRunFixture(db, 'registering');
  binding = run;
  const cred = await new CredentialModel(db, run.userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Acceptance credential',
    payload: { values: { PROVIDER_KEY: SECRET_VALUE } },
    type: 'kv-env',
  });
  const bindConfig: ProviderBindingConfig = {
    enabled: false,
    endpoint: provider.endpoint,
    model: MODEL_ID,
    name: 'Embedded acceptance binding',
    provider: 'mock',
    secretReference: `credential:${cred.id}`,
    selection: {
      effort: 'default',
      mode: 'default',
      runtime: 'orvilo',
      speed: 'default',
      target: 'sandbox',
    },
  };
  const [row] = await db
    .insert(providerBindings)
    .values({ config: bindConfig, userId: run.userId })
    .returning();
  return { cred, row, run };
};

interface Opened {
  host: CanonicalCoreRuntimeHost;
  supervisor: RealProcessSupervisor;
}

const openHost = async (
  run: CanonicalRunBinding,
  spec: {
    artifact?: string;
    extraEnv?: Record<string, string>;
    nodeArgs?: string[];
    transcript?: WireFrame[];
  } = {},
): Promise<Opened> => {
  const dirs = await directoriesFor('isolation');
  directories.push(dirs.root);
  const manifest = loadRunnerManifest();
  const supervisor = realProcessSupervisor({
    extraEnv: spec.extraEnv,
    nodeArgs: spec.nodeArgs,
    supervisorId: 'sup-acceptance',
    transcript: spec.transcript,
  });
  const host = await CanonicalCoreRuntimeHost.open({
    binding: run,
    controlDirectory: dirs.control,
    database: db,
    docker: {
      executable: process.execPath,
      imageId: `runner.mjs@sha256:${manifest.sha256}`,
      supervisorId: 'sup-acceptance',
      workspace: dirs.workspace,
    },
    embedded: {
      artifact: spec.artifact ?? RUNNER_ARTIFACT,
      verifyArtifact: embeddedArtifactVerifier(manifest),
    },
    fileCommitments: [],
    outputDirectory: dirs.output,
    supervisor: supervisor.supervisor,
  });
  return { host, supervisor };
};

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  if (platformDescriptor)
    Object.defineProperty(process, 'platform', { configurable: true, get: () => 'linux' });
  provider = await startStubProvider();
});

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { force: true, recursive: true });
  if (binding) {
    await db.delete(providerBindings).where(inArray(providerBindings.userId, [binding.userId]));
    await db.delete(credentials).where(eq(credentials.ownerUserId, binding.userId));
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
    binding = undefined;
  }
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  await provider.stop();
});

describe('embedded acceptance: artifact verification (real bundle)', () => {
  it('accepts the real dist/runner.mjs against its trusted manifest', async () => {
    if (!RUNNER_UP) return;
    const manifest = loadRunnerManifest();
    const verified = await embeddedArtifactVerifier(manifest)(RUNNER_ARTIFACT, PRIME_EMBEDDED_PIN);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
  });

  it('rejects a tampered bundle: verifier denies AND host start fails closed', async () => {
    if (!RUNNER_UP) return;
    await seed();
    const dirs = await directoriesFor('tampered');
    directories.push(dirs.root);
    const tampered = path.join(dirs.root, 'runner.tampered.mjs');
    await copyFile(RUNNER_ARTIFACT, tampered);
    // One flipped byte inside the real bundle — a genuine sha256 mismatch.
    const content = await readFile(tampered);
    content[0] = content[0] ^ 0xff;
    await writeFile(tampered, content);
    const verifier = embeddedArtifactVerifier(loadRunnerManifest());
    const denied = await verifier(tampered, PRIME_EMBEDDED_PIN);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.code).toBe('policy_denied');

    // End-to-end: the same tampered artifact must fail authorize → launch.
    const { host, supervisor } = await openHost(binding!, { artifact: tampered });
    const started = await host.start();
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.error.code).toBe('policy_denied');
    expect(supervisor.state.launches).toHaveLength(0);
    await host.close();
  });
});

describe.skipIf(!RUNNER_UP)('embedded acceptance: launch isolation (real child)', () => {
  it(
    'launches the runner with a scrubbed environment — no endpoint, headers, or secrets',
    { timeout: 60_000 },
    async () => {
      await seed();
      const { host, supervisor } = await openHost(binding!);
      const started = await host.start();
      expect(started.ok, JSON.stringify(started)).toBe(true);
      if (!started.ok) return;

      expect(supervisor.state.launches).toHaveLength(1);
      const launch = supervisor.state.launches[0];
      // Deep-equality on the exact sanitized allowlist — any leaked variable
      // would appear here by construction, not by sampling.
      expect(launch.environment).toEqual({
        HOME: launch.environment.HOME,
        LANG: 'en_US.UTF-8',
        PYTHONNOUSERSITE: '1',
        TMPDIR: launch.environment.TMPDIR,
      });
      const serialized = JSON.stringify(launch.environment);
      expect(serialized).not.toContain(SECRET_VALUE);
      expect(serialized).not.toContain(provider.endpoint);
      expect(serialized).not.toMatch(/KEY|TOKEN|SECRET|AUTHORIZATION|ENDPOINT/i);

      // The launch input carries no provider endpoint anywhere — the only
      // endpoint the runner knows is the in-bundle `orvilo-broker://local`
      // placeholder (verified inside the compiled artifact itself).
      const args = JSON.stringify(launch.args);
      expect(args).not.toContain(provider.endpoint);
      expect(args).not.toContain(SECRET_VALUE);

      const stopped = await host.shutdown();
      expect(stopped.ok, JSON.stringify(stopped)).toBe(true);
      expect(stopped.ok ? stopped.value.remainingProcesses : 1).toBe(0);
      await host.close();
    },
  );

  it(
    'denied-network: a real prompt completes with zero outbound sockets (netguard --import)',
    { timeout: 90_000 },
    async () => {
      await seed();
      const dirs = await directoriesFor('netguard');
      directories.push(dirs.root);
      const logPath = path.join(dirs.root, 'netguard.jsonl');
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('via stdio only'));
        res.end();
      });
      const { host } = await openHost(binding!, {
        extraEnv: netGuardEnv(logPath, [dirs.workspace, dirs.control]),
        nodeArgs: netGuardNodeArgs(),
      });
      const started = await host.start();
      expect(started.ok, JSON.stringify(started)).toBe(true);
      if (!started.ok) return;

      const events: RuntimeEvent[] = [];
      for await (const event of host.prompt('go')) events.push(event);
      expect(events.some((e) => e.type === 'text' && e.text === 'via stdio only')).toBe(true);

      const stopped = await host.shutdown();
      expect(stopped.ok, JSON.stringify(stopped)).toBe(true);
      await host.close();

      const entries = readNetGuardLog(logPath);
      // Instrumentation actually loaded (one guard-init record).
      expect(entries.some((e) => e.kind === 'guard')).toBe(true);
      // Zero outbound sockets — every byte of inference crossed stdio.
      expect(entries.filter((e) => e.kind === 'net')).toEqual([]);
      // No writes outside the allowed workspace/control/tmp paths.
      expect(
        entries.filter(
          (e) =>
            e.kind === 'fs-write' &&
            !e.detail.startsWith(dirs.workspace) &&
            !e.detail.startsWith(dirs.control) &&
            !e.detail.startsWith(logPath),
        ),
      ).toEqual([]);
    },
  );

  it(
    'no credential material crosses the wire: transcript carries only broker messages',
    { timeout: 90_000 },
    async () => {
      await seed();
      const held = gate();
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('partial'));
        await held.promise;
      });

      const transcript: WireFrame[] = [];
      const { host } = await openHost(binding!, { transcript });
      const started = await host.start();
      expect(started.ok, JSON.stringify(started)).toBe(true);
      if (!started.ok) return;

      const events: RuntimeEvent[] = [];
      const prompting = (async () => {
        for await (const event of host.prompt('go')) events.push(event);
      })();
      await waitFor(() => events.some((e) => e.type === 'text'));

      // Frames witnessed so far cover init, session.prompt and broker.infer.
      const inferFrames = transcript.filter((f) => f.line.includes('"broker.infer"'));
      expect(inferFrames.length).toBeGreaterThan(0);
      // No credential material or endpoint text in any frame — init, prompt,
      // infer and events carry {modelRoute, messages, fence} only.
      const wire = transcript.map((f) => f.line).join('\n');
      expect(wire).not.toContain(SECRET_VALUE);
      expect(wire).not.toContain(provider.endpoint);
      expect(wire).not.toContain('credential:');

      await host.shutdown();
      await prompting;
      held.release();
      await host.close();
    },
  );
});

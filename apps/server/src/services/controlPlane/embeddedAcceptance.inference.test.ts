// @vitest-environment node
/**
 * Phase 6 acceptance — inference suite.
 *
 * The heaviest chain on the box: CanonicalCoreRuntimeHost → PrimeEmbeddedRuntime
 * → REAL dist/runner.mjs child process → broker.infer → REAL
 * createEmbeddedInferenceBridge → REAL SqlTrustedProviderBackend → REAL
 * CredentialModel.decryptPayload (PGlite + KEY_VAULTS_SECRET) → local stub
 * provider over real HTTP+SSE on 127.0.0.1.
 *
 * Only the supervisor is a double: realProcessSupervisor launches the real
 * artifact with the host's exact launch input. It owns the tree and passes the
 * scrubbed env verbatim (real processes/sanitizedEnvironment/credentialsExcluded);
 * filesystem/network are asserted flags — enforcement is container-only and
 * documented in prime-embedded-acceptance.md.
 */
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';

import type { RuntimeEvent } from '@orvilo/agent-execution/controlPlane';
import { embeddedArtifactVerifier } from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
import { credentials, providerBindings, tasks, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';
import {
  directoriesFor,
  gate,
  loadRunnerManifest,
  type RealProcessSupervisor,
  realProcessSupervisor,
  RUNNER_ARTIFACT,
  runnerAvailable,
  sseDelta,
  sseUsage,
  startStubProvider,
  type StubProvider,
  waitFor,
  type WireFrame,
} from './embeddedAcceptance.support';

const RUNNER_UP = runnerAvailable();
const db: OrviloDatabase = await getTestDB();
const MODEL_ID = 'mock-model-1';

// ScopedFileWriter pins /proc/self/fd traversal — Linux-only; stub the platform
// for open() off-Linux exactly like coreRuntimeHost.embedded.test.ts does.
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

let binding: CanonicalRunBinding | undefined;
let originalSecret: string | undefined;
let provider: StubProvider;
const directories: string[] = [];

const bindConfig = (endpoint: string, secretReference: string): ProviderBindingConfig => ({
  enabled: true,
  endpoint,
  model: MODEL_ID,
  name: 'Embedded acceptance binding',
  provider: 'mock',
  secretReference,
  selection: {
    effort: 'default',
    mode: 'default',
    runtime: 'orvilo',
    speed: 'default',
    target: 'sandbox',
  },
});

const seed = async () => {
  const run = await createCanonicalRunFixture(db, 'registering');
  binding = run;
  const cred = await new CredentialModel(db, run.userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Acceptance credential',
    payload: { values: { PROVIDER_KEY: 'env-secret-7' } },
    type: 'kv-env',
  });
  const [row] = await db
    .insert(providerBindings)
    .values({ config: bindConfig(provider.endpoint, `credential:${cred.id}`), userId: run.userId })
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
    extraEnv?: Record<string, string>;
    nodeArgs?: string[];
    transcript?: WireFrame[];
  } = {},
): Promise<Opened> => {
  const dirs = await directoriesFor('inference');
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
      artifact: RUNNER_ARTIFACT,
      // backend omitted → the composition constructs the real
      // SqlTrustedProviderBackend(db) with real credential decryption.
      verifyArtifact: embeddedArtifactVerifier(manifest),
    },
    fileCommitments: [],
    outputDirectory: dirs.output,
    supervisor: supervisor.supervisor,
  });
  return { host, supervisor };
};

const collectPrompt = async (stream: AsyncIterable<RuntimeEvent>): Promise<RuntimeEvent[]> => {
  const events: RuntimeEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
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

describe.skipIf(!RUNNER_UP)('embedded acceptance: inference (real chain)', () => {
  it(
    'drives a prompt end-to-end: real runner → broker → real backend → SSE provider',
    { timeout: 90_000 },
    async () => {
      await seed();
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('Hello '));
        res.write(sseDelta('from the real chain.'));
        res.write(sseUsage(11, 6));
        res.end();
      });

      const { host, supervisor } = await openHost(binding!);
      const started = await host.start();
      expect(started.ok, JSON.stringify(started)).toBe(true);
      if (!started.ok) return;

      const events = await collectPrompt(host.prompt('say hello'));
      expect(events.filter((e) => e.type === 'text')).toEqual([
        { sessionId: started.value.sessionId, text: 'Hello ', type: 'text' },
        {
          sessionId: started.value.sessionId,
          text: 'from the real chain.',
          type: 'text',
        },
      ]);
      expect(events.find((e) => e.type === 'usage')).toMatchObject({
        inputTokens: 11,
        outputTokens: 6,
        type: 'usage',
      });
      expect(events.at(-1)).toMatchObject({ reason: 'end_turn', type: 'turn-ended' });

      // The stub saw exactly one inference POST carrying the decrypted secret —
      // proof the bytes crossed process boundaries, not mocks.
      const inferCall = provider.seenRequests.find((r) => r.url === '/chat/completions');
      expect(inferCall?.headers.authorization).toBe('Bearer env-secret-7');
      expect(provider.inferResponsesAborted()).toBe(0);

      // The launch really happened: supervisor saw the scrubbed environment.
      expect(supervisor.state.launches).toHaveLength(1);

      // shutdown() is the quiescence path (close() only seals the writer).
      const stopped = await host.shutdown();
      expect(stopped.ok).toBe(true);
      if (stopped.ok)
        expect(stopped.value).toMatchObject({ pendingActions: 0, remainingProcesses: 0 });
      expect(supervisor.state.terminatedTrees).toHaveLength(1);
      await host.close();
    },
  );

  it(
    'mid-stream binding bump revokes the runner-side stream (unauthorized)',
    { timeout: 90_000 },
    async () => {
      const { row } = await seed();
      const chunk = gate();
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('first'));
        await chunk.promise;
        res.write(sseDelta('NEVER-SHOULD-ARRIVE'));
        res.write(sseUsage(1, 2));
        res.end();
      });

      const transcript: WireFrame[] = [];
      const { host } = await openHost(binding!, { transcript });
      const started = await host.start();
      if (!started.ok) throw new Error(`host failed to start: ${JSON.stringify(started)}`);

      const iterator = host.prompt('go')[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.value).toMatchObject({ text: 'first', type: 'text' });

      // Revoke: bump the binding row under the in-flight stream.
      await db
        .update(providerBindings)
        .set({ revision: sql`${providerBindings.revision} + 1` })
        .where(eq(providerBindings.id, row.id));
      chunk.release();

      const events: RuntimeEvent[] = [];
      for (;;) {
        const step = await iterator.next();
        if (step.done) break;
        events.push(step.value);
      }
      // The wire saw the fence fire: a flat-code broker.event error frame.
      const wireError = transcript.find(
        (frame) => frame.direction === 'host-to-runner' && frame.line.includes('"type":"error"'),
      );
      expect(wireError).toBeDefined();
      expect(wireError?.line).toContain('"code":"unauthorized"');

      // The caller sees the terminal turn error — not the revoked chunk.
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toMatchObject({ type: 'error' });
      expect(events.some((e) => e.type === 'text')).toBe(false);
      await host.close();
    },
  );

  it(
    'stopped task mid-stream yields revoked — requestStop kills the stream',
    { timeout: 90_000 },
    async () => {
      await seed();
      const chunk = gate();
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('a'));
        await chunk.promise;
        res.write(sseDelta('late'));
        res.end();
      });

      const transcript: WireFrame[] = [];
      const { host } = await openHost(binding!, { transcript });
      const started = await host.start();
      if (!started.ok) throw new Error(`host failed to start: ${JSON.stringify(started)}`);

      const iterator = host.prompt('go')[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.value).toMatchObject({ text: 'a', type: 'text' });

      await db
        .update(tasks)
        .set({ status: 'stopped' })
        .where(eq(tasks.id, fixtureTaskId(binding!)));
      chunk.release();

      const events: RuntimeEvent[] = [];
      for (;;) {
        const step = await iterator.next();
        if (step.done) break;
        events.push(step.value);
      }
      const wireError = transcript.find(
        (frame) => frame.direction === 'host-to-runner' && frame.line.includes('"type":"error"'),
      );
      expect(wireError?.line).toContain('"code":"revoked"');
      expect(events.find((e) => e.type === 'error')).toMatchObject({ type: 'error' });
      await host.close();
    },
  );

  it(
    'cancel propagates to the provider: upstream request is aborted',
    { timeout: 90_000 },
    async () => {
      await seed();
      const held = gate();
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('partial'));
        await held.promise; // held open until the client aborts
      });

      const { host } = await openHost(binding!);
      const started = await host.start();
      if (!started.ok) throw new Error(`host failed to start: ${JSON.stringify(started)}`);

      const events: RuntimeEvent[] = [];
      const prompting = (async () => {
        for await (const event of host.prompt('go')) events.push(event);
      })();
      await waitFor(() => events.some((e) => e.type === 'text'));
      expect(events[0]).toMatchObject({ text: 'partial', type: 'text' });

      // shutdown() is the documented cancel path: runtime.cancel →
      // brokerCancels + session.abort notification + transport close +
      // tree terminate. The backend's AbortController unwinds the fetch.
      const stopped = await host.shutdown();
      expect(stopped.ok).toBe(true);
      await prompting;

      // The provider's open response must have been destroyed by the abort.
      await waitFor(() => provider.inferResponsesAborted() === 1);
      expect(events.at(-1)).toMatchObject({ reason: 'cancelled', type: 'turn-ended' });
      held.release();
      await host.close();
    },
  );
});

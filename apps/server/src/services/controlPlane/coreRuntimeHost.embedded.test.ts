// @vitest-environment node
/**
 * Phase-4 host integration: `CanonicalCoreRuntimeHost` composes
 * PrimeEmbeddedRuntime + the broker inference bridge for `type:'orvilo'` runs
 * when the `embedded` option is present, and keeps the ACP adapter otherwise.
 *
 * The supervisor is a wire-level double: ndjson JSON-RPC over PassThrough
 * pairs, the same frames the real container's stdio carries, so the launch →
 * handshake → register ordering and the terminate → drainActions → quiescence
 * path are exercised exactly as DockerProcessTreeSupervisor drives them.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import type {
  InferenceEvent,
  ProviderModelCapability,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import { HARNESS_PROTOCOL_VERSION } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import type {
  DockerSupervisorOptions,
  EmbeddedArtifactManifest,
  IsolatedLaunch,
  IsolationEvidence,
} from '@orvilo/agent-execution/controlPlane/server';
import {
  embeddedArtifactVerifier,
  PRIME_EMBEDDED_PIN,
  PRIME_RUNTIME_PIN,
} from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import { isRecord } from '@orvilo/utils/object';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import { credentials, providerBindings, taskDispatches, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { resolveOrviloProviderBinding } from '../providerBinding/execution';
import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture } from './canonicalRun.test-utils';
import type { EmbeddedRuntimeComposition, HostSupervisorPort } from './coreRuntimeHost';
import { CanonicalCoreRuntimeHost } from './coreRuntimeHost';

const db: OrviloDatabase = await getTestDB();

const MODEL_ID = 'mock-model-1';
const RUNNER_SESSION = `harness-${randomUUID()}`;

// ScopedFileWriter pins /proc/self/fd traversal — Linux-only by design. The
// writer capability is never exercised here (no file actions), so the
// platform guard is stubbed for open() off-Linux; CI still runs it on Linux.
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

// ---------- wire-level runner double ----------

interface WireCapture {
  /** Host → runner notifications (method, params). */
  notifications: Array<{ method: string; params: unknown }>;
  /** Host → runner requests, in arrival order. */
  requests: Array<{ method: string; params: unknown }>;
}

/** Parses the host's ndjson JSON-RPC frames and answers like the runner:
 * `{id, method, params}` gets a `{id, result}` reply; `{method}` alone is a
 * notification. `undefined` results simulate the runner never answering. */
const wireRunner = (
  toRunner: PassThrough,
  fromRunner: PassThrough,
  respond: (method: string, params: unknown) => unknown,
): WireCapture => {
  const capture: WireCapture = { notifications: [], requests: [] };
  let buffered = '';
  toRunner.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    for (;;) {
      const newline = buffered.indexOf('\n');
      if (newline < 0) break;
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      const message: unknown = JSON.parse(line);
      if (!isRecord(message) || typeof message.method !== 'string') continue;
      if (message.id !== undefined) {
        capture.requests.push({ method: message.method, params: message.params });
        const result = respond(message.method, message.params);
        if (result !== undefined)
          fromRunner.write(`${JSON.stringify({ id: message.id, jsonrpc: '2.0', result })}\n`);
      } else {
        capture.notifications.push({ method: message.method, params: message.params });
      }
    }
  });
  return capture;
};

// ---------- supervised tree double ----------

interface FakeTree {
  fromRunner: PassThrough;
  toRunner: PassThrough;
  treeId: string;
  wire: WireCapture;
}

interface FakeSupervisorState {
  launches: IsolatedLaunch[];
  terminated: string[];
  tree?: FakeTree;
}

/** Shared container state outside the factory: a launched tree outlives the
 * host process, so `state` persists across `open()`-constructed ports while
 * each port carries its own host-bound `drainActions`. */
const fakeSupervisor = (init: {
  order: string[];
  respond: (method: string, params: unknown) => unknown;
  state?: FakeSupervisorState;
  supervisorId: string;
}) => {
  const state: FakeSupervisorState = init.state ?? { launches: [], terminated: [] };
  const factory = (options: DockerSupervisorOptions): HostSupervisorPort => ({
    connect: async (treeId) => {
      if (!state.tree || state.tree.treeId !== treeId) throw new Error('Unknown runtime tree');
      return { stdin: state.tree.toRunner, stdout: state.tree.fromRunner };
    },
    launch: async (input) => {
      init.order.push('launch');
      state.launches.push(input);
      const toRunner = new PassThrough();
      const fromRunner = new PassThrough();
      const treeId = `tree-${randomUUID()}`;
      state.tree = {
        fromRunner,
        toRunner,
        treeId,
        wire: wireRunner(toRunner, fromRunner, init.respond),
      };
      const value: IsolationEvidence = {
        credentialsExcluded: true,
        enforced: true,
        filesystem: true,
        network: true,
        processes: true,
        sanitizedEnvironment: true,
        supervisorId: init.supervisorId,
        treeId,
      };
      return { ok: true as const, value };
    },
    recover: async () => state.tree?.treeId,
    terminate: async (treeId) => {
      init.order.push('terminate');
      state.terminated.push(treeId);
      // Same evidence path as DockerProcessTreeSupervisor: drain through the
      // host's canonical stop first, then report quiescence.
      const drained = await options.drainActions(treeId);
      state.tree = undefined;
      return {
        ok: true as const,
        value: {
          observedAt: Date.now(),
          pendingActions: drained.pendingActions,
          remainingProcesses: 0,
          supervisorId: init.supervisorId,
          treeId,
        },
      };
    },
  });
  return { factory, state };
};

// ---------- fixtures ----------

const harnessAck = (params: unknown) => ({
  capabilities: { cancel: true, prompt: true, requests: [], stream: true, tools: [] },
  pin: isRecord(params) ? params.pin : undefined,
  protocolVersion: HARNESS_PROTOCOL_VERSION,
  sessionId: RUNNER_SESSION,
});

const acpReply = (method: string) => {
  if (method === 'initialize')
    return {
      agentCapabilities: { loadSession: false },
      agentInfo: { name: 'prime-agent', version: PRIME_RUNTIME_PIN.version },
      protocolVersion: 1,
    };
  if (method === 'session/new') return { sessionId: randomUUID() };
  return {};
};

const capability: ProviderModelCapability = {
  images: false,
  maxOutputTokens: 8192,
  modelRoute: MODEL_ID,
  text: true,
  tools: false,
};

const fakeBackend: TrustedProviderBackend = {
  capabilities: async () => [capability],
  check: async () => true,
  infer: () => {
    async function* stream(): AsyncGenerator<InferenceEvent> {
      yield { inputTokens: 1, outputTokens: 1, type: 'usage' as const };
    }
    return stream();
  },
};

let binding: CanonicalRunBinding | undefined;
let originalSecret: string | undefined;
const directories: string[] = [];

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  if (platformDescriptor)
    Object.defineProperty(process, 'platform', {
      configurable: true,
      get: () => 'linux',
    });
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

afterAll(() => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
});

const directoriesFor = async () => {
  // Canonicalize the tmpdir root: macOS links /var to /private/var and the
  // host requires realpath-stable broker directories.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'core-host-embedded-')));
  directories.push(root);
  const workspace = path.join(root, 'workspace');
  const controlDirectory = path.join(root, 'control');
  const outputDirectory = path.join(root, 'output');
  await mkdir(workspace, { mode: 0o700 });
  await mkdir(controlDirectory, { mode: 0o700 });
  await mkdir(outputDirectory, { mode: 0o700 });
  return { controlDirectory, outputDirectory, workspace };
};

const writeArtifact = async (directory: string, content = '// pinned runner\n') => {
  const artifact = path.join(directory, 'runner.mjs');
  await writeFile(artifact, content);
  const manifest: EmbeddedArtifactManifest = {
    artifact: 'runner.mjs',
    bytes: (await stat(artifact)).size,
    prime: {
      commit: PRIME_EMBEDDED_PIN.commit,
      license: PRIME_EMBEDDED_PIN.license,
      version: PRIME_EMBEDDED_PIN.version,
    },
    schemaVersion: 1,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
  return { artifact, manifest };
};

const seedBinding = async (run: CanonicalRunBinding) => {
  const cred = await new CredentialModel(db, run.userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values: { PROVIDER_KEY: 'env-secret-7' } },
    type: 'kv-env',
  });
  const [row] = await db
    .insert(providerBindings)
    .values({
      config: {
        // Armed — `enabled` gates both binding resolution and issuance.
        enabled: true,
        endpoint: 'https://provider.example.test/',
        model: MODEL_ID,
        name: 'Embedded host fixture',
        provider: 'mock',
        secretReference: `credential:${cred.id}`,
        selection: {
          effort: 'default',
          mode: 'default',
          runtime: 'orvilo',
          speed: 'default',
          target: 'sandbox',
        },
      },
      userId: run.userId,
    })
    .returning();
  return row;
};

const embeddedOptions = (init: {
  artifact: string;
  manifest: EmbeddedArtifactManifest;
  /** Observed ordering seam — records verifyArtifact invocations. */
  order?: string[];
  resolveCalls?: { count: number };
  verify?: EmbeddedRuntimeComposition['verifyArtifact'];
}): EmbeddedRuntimeComposition => ({
  artifact: init.artifact,
  backend: fakeBackend,
  resolveBinding:
    init.resolveCalls &&
    (async (...args: Parameters<typeof resolveOrviloProviderBinding>) => {
      init.resolveCalls!.count += 1;
      return resolveOrviloProviderBinding(...args);
    }),
  verifyArtifact:
    init.verify ??
    (async (artifact, pin) => {
      init.order?.push('verifyArtifact');
      return embeddedArtifactVerifier(init.manifest)(artifact, pin);
    }),
});

const control = async (run: CanonicalRunBinding) =>
  new TaskExecutionControlModel(db, run.userId, run.workspaceId).readControl(run);

describe('embedded host composition', () => {
  it('composes PrimeEmbeddedRuntime + the broker bridge when the option is set', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    await seedBinding(run);
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: (method, params) => (method === 'harness.init' ? harnessAck(params) : {}),
      supervisorId: 'sup-embedded',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:embedded-test',
        supervisorId: 'sup-embedded',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest, order }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    const started = await host.start();
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.runtimeId).toBe('prime-embedded');
    expect(started.value.sessionId).toBe(RUNNER_SESSION);
    expect(started.value.fence.leaseId).toBe(run.runtimeLeaseId);
    // Harness vocabulary, not ACP: no initialize/session/new on the wire.
    const methods = supervisor.state.tree!.wire.requests.map((r) => r.method);
    expect(methods).toEqual(['harness.init']);
    // harness.init carries the model pinned from the issued binding.
    const init = supervisor.state.tree!.wire.requests[0]!.params;
    expect(isRecord(init) && isRecord(init.model) && init.model.id).toBe(MODEL_ID);
    expect(isRecord(init) && isRecord(init.pin) && init.pin.commit).toBe(PRIME_EMBEDDED_PIN.commit);
    expect(supervisor.state.launches).toHaveLength(1);
    expect(supervisor.state.launches[0]!.executable).toBe('/usr/local/bin/node');
    expect(supervisor.state.launches[0]!.args).toEqual([artifact]);
    await host.close();
  });

  it('keeps the ACP adapter when the embedded option is absent', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    const dirs = await directoriesFor();
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: (method) => acpReply(method),
      supervisorId: 'sup-acp',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/prime-pinned',
        imageId: 'sha256:acp-test',
        supervisorId: 'sup-acp',
        workspace: dirs.workspace,
      },
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
      verifyArtifact: async () => {
        order.push('verifyArtifact');
        return { ok: true, value: true };
      },
    });
    const started = await host.start();
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.runtimeId).toBe('prime-agent');
    const methods = supervisor.state.tree!.wire.requests.map((r) => r.method);
    expect(methods).toEqual(['initialize', 'session/new']);
    expect(order).toEqual(['verifyArtifact', 'launch']);
    await host.close();
  });
});

describe('embedded artifact verification and launch order', () => {
  it('preserves verifyArtifact → launch → handshake → register ordering', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    await seedBinding(run);
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: (method, params) => {
        if (method === 'harness.init') {
          order.push('harness.init');
          return harnessAck(params);
        }
        return {};
      },
      supervisorId: 'sup-order',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:order-test',
        supervisorId: 'sup-order',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest, order }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    const started = await host.start();
    expect(started.ok).toBe(true);
    expect(order).toEqual(['verifyArtifact', 'launch', 'harness.init']);
    const registered = await control(run);
    expect(registered?.control?.state).toBe('running');
    expect(registered?.control?.treeId).toBe(supervisor.state.tree!.treeId);
    await host.close();
  });

  it('denies a tampered artifact before launch', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    await seedBinding(run);
    const dirs = await directoriesFor();
    // Manifest describes the pinned bundle; the file on disk is not it.
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    await writeFile(artifact, '// tampered runner\n');
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: () => ({}),
      supervisorId: 'sup-tamper',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:tamper-test',
        supervisorId: 'sup-tamper',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest, order }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    const started = await host.start();
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error.code).toBe('policy_denied');
    expect(order).toEqual(['verifyArtifact']);
    expect(supervisor.state.launches).toHaveLength(0);
    expect((await control(run))?.control?.state).toBe('registering');
    await host.close();
  });

  it('denies a manifest whose upstream pin does not match', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    await seedBinding(run);
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const drifted: EmbeddedArtifactManifest = {
      ...manifest,
      prime: { ...manifest.prime, version: '0.9.9' },
    };
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: () => ({}),
      supervisorId: 'sup-drift',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:drift-test',
        supervisorId: 'sup-drift',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest: drifted, order }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    const started = await host.start();
    expect(started.ok).toBe(false);
    expect(supervisor.state.launches).toHaveLength(0);
    await host.close();
  });
});

describe('embedded drain/recovery parity', () => {
  it('drains an orphaned embedded session on host restart without resurrecting dispatch', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    await seedBinding(run);
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const state: FakeSupervisorState = { launches: [], terminated: [] };
    const order: string[] = [];
    const resolveCalls = { count: 0 };
    const supervisor = fakeSupervisor({
      order,
      respond: (method, params) => (method === 'harness.init' ? harnessAck(params) : {}),
      state,
      supervisorId: 'sup-recover',
    });
    const options = () => ({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:recover-test',
        supervisorId: 'sup-recover',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest, resolveCalls }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    // First host: compose + launch + activate, then die mid-session.
    const first = await CanonicalCoreRuntimeHost.open(options());
    const started = await first.start();
    expect(started.ok).toBe(true);
    expect((await control(run))?.control?.state).toBe('running');
    const treeId = state.tree!.treeId;
    const resolvesAtCompose = resolveCalls.count;
    expect(resolvesAtCompose).toBeGreaterThan(0);

    // Host restart over the journaled control directory: recovery-only host.
    const restarted = await CanonicalCoreRuntimeHost.open(options());
    // Recovery must not re-resolve the binding — drain/stop stays available even
    // when the provider route vanished while the tree was orphaned.
    expect(resolveCalls.count).toBe(resolvesAtCompose);
    // A recovered host never relaunches its orphaned session.
    const relaunch = await restarted.start();
    expect(relaunch.ok).toBe(false);
    expect(state.launches).toHaveLength(1);

    const stopped = await restarted.recoverStop();
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    // Quiescence proof from the same drainActions path an ACP tree uses.
    expect(stopped.value.treeId).toBe(treeId);
    expect(stopped.value.pendingActions).toBe(0);
    expect(stopped.value.remainingProcesses).toBe(0);
    // Canonical registration stopped; the dispatch is fenced, not resurrected.
    expect((await control(run))?.control?.state).toBe('stopped');
    const [dispatch] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.id, run.dispatchId))
      .limit(1);
    expect(dispatch?.phase).toBe('cancel_requested');
    expect(state.terminated).toEqual([treeId]);
    await restarted.close();
  });
});

describe('embedded binding fence at launch', () => {
  it('fails closed when the binding is bumped between compose and start', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    const row = await seedBinding(run);
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const order: string[] = [];
    const supervisor = fakeSupervisor({
      order,
      respond: () => ({}),
      supervisorId: 'sup-revoked',
    });
    const host = await CanonicalCoreRuntimeHost.open({
      binding: run,
      controlDirectory: dirs.controlDirectory,
      database: db,
      docker: {
        executable: '/usr/local/bin/node',
        imageId: 'sha256:revoked-test',
        supervisorId: 'sup-revoked',
        workspace: dirs.workspace,
      },
      embedded: embeddedOptions({ artifact, manifest, order }),
      fileCommitments: [],
      outputDirectory: dirs.outputDirectory,
      supervisor: supervisor.factory,
    });
    // Composition pinned {bindingId, revision}; bump the row before start().
    await db
      .update(providerBindings)
      .set({ revision: sql`${providerBindings.revision} + 1` })
      .where(eq(providerBindings.id, row.id));
    const started = await host.start();
    expect(started.ok).toBe(false);
    if (started.ok) return;
    expect(started.error.code).toBe('unauthorized');
    // Fail closed BEFORE the supervisor ever launches: no verify, no launch, no wire.
    expect(order).toEqual([]);
    expect(supervisor.state.launches).toHaveLength(0);
    expect((await control(run))?.control?.state).toBe('registering');
    await host.close();
  });

  it('fails closed at open() when no orvilo binding resolves', async () => {
    const run = await createCanonicalRunFixture(db, 'registering');
    binding = run;
    const dirs = await directoriesFor();
    const { artifact, manifest } = await writeArtifact(dirs.controlDirectory);
    const supervisor = fakeSupervisor({
      order: [],
      respond: () => ({}),
      supervisorId: 'sup-none',
    });
    await expect(
      CanonicalCoreRuntimeHost.open({
        binding: run,
        controlDirectory: dirs.controlDirectory,
        database: db,
        docker: {
          executable: '/usr/local/bin/node',
          imageId: 'sha256:none-test',
          supervisorId: 'sup-none',
          workspace: dirs.workspace,
        },
        embedded: embeddedOptions({ artifact, manifest }),
        fileCommitments: [],
        outputDirectory: dirs.outputDirectory,
        supervisor: supervisor.factory,
      }),
    ).rejects.toThrow('Embedded inference bridge is not issuable');
    expect(supervisor.state.launches).toHaveLength(0);
  });
});

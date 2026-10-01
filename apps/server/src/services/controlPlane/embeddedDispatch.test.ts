// @vitest-environment node
/**
 * Phase-5a dispatch routing: `resolveEmbeddedDispatchRoute` admits every
 * own-agent (`heteroType === 'orvilo'`) task dispatch unconditionally,
 * `openEmbeddedDispatchHost` composes
 * `CanonicalCoreRuntimeHost` + the embedded bridge against the canonical rows,
 * and `driveEmbeddedCanonicalRun` produces through the shared
 * heteroIngest/heteroFinish surface.
 *
 * The supervisor is a wire-level double: ndjson JSON-RPC over PassThrough
 * pairs, the same frames the real container's stdio carries — including the
 * runner's reverse `broker.infer` request, so the authority's per-event
 * `withRun` recheck (a stopped dispatch aborting inference mid-stream) is
 * exercised for real.
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
import type {
  DockerSupervisorOptions,
  EmbeddedArtifactManifest,
  IsolatedLaunch,
  IsolationEvidence,
} from '@orvilo/agent-execution/controlPlane/server';
import { PRIME_EMBEDDED_PIN } from '@orvilo/agent-execution/controlPlane/server';
import { getTestDB } from '@orvilo/database/test-utils';
import { isRecord } from '@orvilo/utils/object';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  agentOperations,
  agents,
  credentials,
  executionGrants,
  messages,
  providerBindings,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import { TASK_EXECUTION_CONTROL_CANDIDATE_SQL } from '@/database/schemas/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';
import {
  cleanupTestUser,
  createTestUser,
} from '@/server/routers/lambda/__tests__/integration/setup';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';
import {
  createRemoteRunAdmission,
  writeRemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';

import type { HostSupervisorPort } from './coreRuntimeHost';
import {
  driveEmbeddedCanonicalRun,
  openEmbeddedDispatchHost,
  resolveEmbeddedDispatchRoute,
} from './embeddedDispatch';

const db: OrviloDatabase = await getTestDB();

const MODEL_ID = 'mock-model-1';
const RUNNER_SESSION = `harness-${randomUUID()}`;

// ScopedFileWriter pins /proc/self/fd traversal — Linux-only by design. The
// writer capability is never exercised here (no file actions), so the
// platform guard is stubbed for open() off-Linux; CI still runs it on Linux.
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

// ---------- wire-level runner double ----------

interface RunnerFrame {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
}

interface RunnerWire {
  /** Host → runner notifications, in arrival order. */
  notifications: Array<{ method: string; params: unknown }>;
  /** Emit a runner → host notification. */
  notify: (method: string, params: unknown) => void;
  /** Answer a host → runner request. */
  reply: (id: number | string, result: unknown) => void;
  /** Host → runner requests, in arrival order. */
  requests: Array<{ id: number | string; method: string; params: unknown }>;
  /** Issue a runner → host reverse request (`broker.infer`). */
  reverseRequest: (method: string, params: unknown) => Promise<unknown>;
  /** Observe every parsed host → runner frame. */
  subscribe: (listener: (frame: RunnerFrame) => void) => void;
}

/**
 * One ndjson JSON-RPC line parser per runner stream: host requests and
 * notifications land in `requests`/`notifications` and on subscribers; a
 * `{id, result}` frame settles the runner's own pending reverse request.
 */
const runnerWire = (toRunner: PassThrough, fromRunner: PassThrough): RunnerWire => {
  const pending = new Map<number | string, (result: unknown) => void>();
  const requests: RunnerWire['requests'] = [];
  const notifications: RunnerWire['notifications'] = [];
  const listeners: Array<(frame: RunnerFrame) => void> = [];
  let buffered = '';
  toRunner.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    for (;;) {
      const newline = buffered.indexOf('\n');
      if (newline < 0) break;
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      const frame: RunnerFrame = JSON.parse(line);
      listeners.forEach((listener) => listener(frame));
      if (frame.id !== undefined && frame.result !== undefined && frame.method === undefined) {
        pending.get(frame.id)?.(frame.result);
        pending.delete(frame.id);
        continue;
      }
      if (typeof frame.method !== 'string') continue;
      if (frame.id === undefined) {
        notifications.push({ method: frame.method, params: frame.params });
        continue;
      }
      requests.push({ id: frame.id, method: frame.method, params: frame.params });
    }
  });
  return {
    notifications,
    notify: (method, params) =>
      fromRunner.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`),
    reply: (id, result) => fromRunner.write(`${JSON.stringify({ id, jsonrpc: '2.0', result })}\n`),
    requests,
    reverseRequest: (method, params) => {
      const id = `reverse-${randomUUID()}`;
      const promised = new Promise<unknown>((resolve) => pending.set(id, resolve));
      fromRunner.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
      return promised;
    },
    subscribe: (listener) => listeners.push(listener),
  };
};

interface FakeTree {
  fromRunner: PassThrough;
  toRunner: PassThrough;
  treeId: string;
  wire: RunnerWire;
}

interface FakeSupervisorState {
  launches: IsolatedLaunch[];
  terminated: string[];
  tree?: FakeTree;
}

/** Container-tree supervisor double. `onRequest` answers each host → runner
 * request for the launched tree's wire. */
const fakeSupervisor = (init: {
  onRequest: (
    wire: RunnerWire,
    request: { id: number | string; method: string; params: unknown },
  ) => void;
  supervisorId: string;
}) => {
  const state: FakeSupervisorState = { launches: [], terminated: [] };
  const factory = (options: DockerSupervisorOptions): HostSupervisorPort => ({
    connect: async (treeId) => {
      if (!state.tree || state.tree.treeId !== treeId) throw new Error('Unknown runtime tree');
      return { stdin: state.tree.toRunner, stdout: state.tree.fromRunner };
    },
    launch: async (input) => {
      state.launches.push(input);
      const toRunner = new PassThrough();
      const fromRunner = new PassThrough();
      const treeId = `tree-${randomUUID()}`;
      const wire = runnerWire(toRunner, fromRunner);
      state.tree = { fromRunner, toRunner, treeId, wire };
      wire.subscribe((frame) => {
        if (
          typeof frame.method === 'string' &&
          frame.id !== undefined &&
          frame.result === undefined
        )
          init.onRequest(wire, { id: frame.id, method: frame.method, params: frame.params });
      });
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
      state.terminated.push(treeId);
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

const harnessAck = (params: unknown) => ({
  capabilities: { cancel: true, prompt: true, requests: [], stream: true, tools: [] },
  pin: isRecord(params) ? params.pin : undefined,
  protocolVersion: 1,
  sessionId: RUNNER_SESSION,
});

const capability: ProviderModelCapability = {
  images: false,
  maxOutputTokens: 8192,
  modelRoute: MODEL_ID,
  text: true,
  tools: false,
};

/** Trusted-backend double emitting text + usage InferenceEvents; `between`
 * lets a test interleave a fence bump between streamed events. */
const fakeBackend = (hooks?: { between?: () => Promise<void> }): TrustedProviderBackend => ({
  capabilities: async () => [capability],
  check: async () => true,
  infer: () => {
    async function* stream(): AsyncGenerator<InferenceEvent> {
      yield { type: 'text', text: 'hello ' };
      await hooks?.between?.();
      yield { type: 'text', text: 'world' };
      yield { inputTokens: 10, outputTokens: 2, type: 'usage' };
    }
    return stream();
  },
});

/**
 * Wire-level runner that drives one turn end-to-end: `harness.init` ack; on
 * `session.prompt` it issues the reverse `broker.infer`, forwards every
 * `broker.event` back as the runner's `harness.event` notifications, and
 * answers `end_turn` when the broker stream ends (or reports an error).
 */
const promptDrivingSupervisor = () => {
  const order: string[] = [];
  const supervisor = fakeSupervisor({
    supervisorId: 'sup-embedded-test',
    onRequest: (wire, request) => {
      if (request.method === 'harness.init') {
        order.push('harness.init');
        wire.reply(request.id, harnessAck(request.params));
        return;
      }
      if (request.method !== 'session.prompt') {
        wire.reply(request.id, {});
        return;
      }
      order.push('session.prompt');
      const params = request.params;
      const sessionId =
        isRecord(params) && typeof params.sessionId === 'string'
          ? params.sessionId
          : RUNNER_SESSION;
      const text = isRecord(params) && typeof params.text === 'string' ? params.text : '';
      const requestId = `req-${randomUUID()}`;
      let replied = false;
      const endTurn = () => {
        if (!replied) {
          replied = true;
          wire.reply(request.id, { stopReason: 'end_turn' });
        }
      };
      wire.subscribe((frame) => {
        if (frame.method !== 'broker.event' || !isRecord(frame.params)) return;
        if (frame.params.requestId !== requestId) return;
        const event = frame.params.event as InferenceEvent | { type: 'end' };
        if (event.type === 'text') {
          wire.notify('harness.event', {
            event: { kind: 'text', text: event.text },
            sessionId,
          });
          return;
        }
        if (event.type === 'usage') {
          wire.notify('harness.event', {
            event: {
              inputTokens: event.inputTokens,
              kind: 'usage',
              outputTokens: event.outputTokens,
            },
            sessionId,
          });
          return;
        }
        if (event.type === 'error') {
          wire.notify('harness.event', {
            event: { kind: 'error', message: event.error.message },
            sessionId,
          });
          endTurn();
          return;
        }
        if (event.type === 'end') endTurn();
      });
      void wire.reverseRequest('broker.infer', {
        request: {
          maxOutputTokens: 8192,
          messages: [{ content: text, role: 'user' }],
          modelRoute: MODEL_ID,
          requestId,
        },
        sessionId,
      });
    },
  });
  return { order, supervisor };
};

// ---------- fixtures ----------

const directories: string[] = [];
const seeded: Array<{ userId: string; workspaceId: string }> = [];
let originalDisableRedis: string | undefined;
let originalSecret: string | undefined;

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  originalDisableRedis = process.env.DISABLE_REDIS;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  // No broker in the test env — pin the in-memory stream manager so ingest's
  // publish path is exercised rather than failing against a dead Redis.
  process.env.DISABLE_REDIS = 'true';
  if (platformDescriptor)
    Object.defineProperty(process, 'platform', {
      configurable: true,
      get: () => 'linux',
    });
  for (const statement of TASK_EXECUTION_CONTROL_CANDIDATE_SQL) {
    await db.execute(sql.raw(statement));
  }
});

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { force: true, recursive: true });
  for (const row of seeded.splice(0)) {
    await db.delete(executionGrants).where(eq(executionGrants.workspaceId, row.workspaceId));
    await db.delete(providerBindings).where(eq(providerBindings.userId, row.userId));
    await db.delete(credentials).where(eq(credentials.ownerUserId, row.userId));
    await db.delete(workspaces).where(eq(workspaces.id, row.workspaceId));
    await cleanupTestUser(db, row.userId);
  }
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  if (originalDisableRedis === undefined) delete process.env.DISABLE_REDIS;
  else process.env.DISABLE_REDIS = originalDisableRedis;
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
});

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
  await writeFile(path.join(directory, 'runner.manifest.json'), JSON.stringify(manifest));
  return { artifact, manifest };
};

/**
 * The rows a real `runTask` dispatch leaves behind at the moment the embedded
 * seam fires: task running under a running dispatch (fence 2, generation 1),
 * the taskTopics run row, a running operation with an `embedded`-channel
 * admission ledger entry, the topic's runningOperation marker, and the
 * assistant placeholder message. NO execution-control registration and, unless
 * `delegateGrant`, NO run grant — `open()` registers and the driver mints.
 */
const seedEmbeddedRun = async (init: { delegateGrant?: boolean } = {}) => {
  const userId = await createTestUser(db);
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Embedded', primaryOwnerId: userId, slug: randomUUID() })
    .returning();
  seeded.push({ userId, workspaceId: workspace.id });
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId: workspace.id });
  const agentId = `agt_${randomBytes(8).toString('hex')}`;
  await db.insert(agents).values({ id: agentId, userId, workspaceId: workspace.id });
  const topicId = `tpc_${randomBytes(8).toString('hex')}`;
  const operationId = `op_${Date.now()}_${agentId}_${topicId}_${randomBytes(6).toString('hex')}`;
  const assistantMessageId = `msg_${randomBytes(8).toString('hex')}`;
  const dispatchId = randomUUID();
  // tasks.current_topic_id references topics — the topic precedes the task.
  await db.insert(topics).values({
    agentId,
    id: topicId,
    metadata: { runningOperation: { assistantMessageId, operationId } },
    userId,
    workspaceId: workspace.id,
  });
  const [task] = await db
    .insert(tasks)
    .values({
      assigneeAgentId: agentId,
      createdByUserId: userId,
      currentTopicId: topicId,
      executionGeneration: 1,
      identifier: 'EMB-1',
      instruction: 'test',
      seq: 1,
      status: 'running',
      workspaceId: workspace.id,
    })
    .returning();
  await db.insert(messages).values({
    agentId,
    content: '',
    id: assistantMessageId,
    role: 'assistant',
    topicId,
    userId,
    workspaceId: workspace.id,
  });
  await db.insert(taskDispatches).values({
    agentId,
    fence: 2,
    generation: 1,
    id: dispatchId,
    idempotencyKey: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + 300_000),
    leaseOwner: 'orvilo-embedded-host',
    operationId,
    phase: 'running',
    policyRevision: task.policyRevision,
    requestedBy: `manual:${userId}`,
    requirementRevision: task.requirementRevision,
    taskId: task.id,
    taskRevision: task.domainRevision,
    workspaceId: workspace.id,
  });
  await db.insert(taskTopics).values({
    dispatchFence: 2,
    dispatchId,
    executionGeneration: 1,
    operationId,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
    seq: 1,
    taskId: task.id,
    topicId,
    userId,
    workspaceId: workspace.id,
  });
  await db.insert(agentOperations).values({
    agentId,
    id: operationId,
    status: 'running',
    taskId: task.id,
    topicId,
    userId,
    workspaceId: workspace.id,
  });
  await createRemoteRunAdmission(db, operationId, {
    channel: 'embedded',
    generation: 1,
    idempotencyKey: operationId,
  });
  await writeRemoteRunAdmission(db, operationId, { state: 'acknowledged' });
  let executionEpoch: number | undefined;
  let executionGrantId: string | undefined;
  if (init.delegateGrant) {
    const delegation = new AgentDelegationService(db, userId, workspace.id);
    const grant = await delegation.createGrant({
      agentId,
      expiresAt: new Date(Date.now() + 300_000),
      task: { id: task.id, projectId: null, workspaceId: workspace.id },
    });
    executionEpoch = await delegation.claimExecutionEpoch({
      grantId: grant.id,
      taskId: task.id,
      topicId,
    });
    executionGrantId = grant.id;
  }
  return {
    agentId,
    assistantMessageId,
    dispatchFence: 2,
    dispatchId,
    executionEpoch,
    executionGeneration: 1,
    executionGrantId,
    operationId,
    taskId: task.id,
    topicId,
    userId,
    workspaceId: workspace.id,
  };
};

const seedBinding = async (userId: string) => {
  const cred = await new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Fixture credential',
    payload: { values: { PROVIDER_KEY: 'env-secret-7' } },
    type: 'kv-env',
  });
  const [row] = await db
    .insert(providerBindings)
    .values({
      config: {
        enabled: false,
        endpoint: 'https://provider.example.test/',
        model: MODEL_ID,
        name: 'Embedded dispatch fixture',
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
      userId,
    })
    .returning();
  return row;
};

const fixtureDirectories = async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'embedded-dispatch-')));
  directories.push(root);
  await mkdir(path.join(root, 'control'), { mode: 0o700, recursive: true });
  const { artifact } = await writeArtifact(path.join(root, 'control'));
  return { artifact, root };
};

const environmentFor = (
  root: string,
  artifact: string,
  init: {
    backend?: TrustedProviderBackend;
    supervisor?: (options: DockerSupervisorOptions) => HostSupervisorPort;
  } = {},
) => ({
  artifact,
  backend: init.backend ?? fakeBackend(),
  imageId: 'sha256:embedded-dispatch-test',
  runDirectory: root,
  supervisor: init.supervisor ?? promptDrivingSupervisor().supervisor.factory,
});

const openInput = (
  run: Awaited<ReturnType<typeof seedEmbeddedRun>>,
  environment: ReturnType<typeof environmentFor>,
) => ({
  dispatchFence: run.dispatchFence,
  dispatchId: run.dispatchId,
  environment,
  executionGeneration: run.executionGeneration,
  model: MODEL_ID,
  operationId: run.operationId,
  provider: 'mock',
  taskId: run.taskId,
  topicId: run.topicId,
});

describe('resolveEmbeddedDispatchRoute', () => {
  it('admits every own-agent task dispatch; ACP/hetero kinds never match', async () => {
    const userId = `u_${randomBytes(4).toString('hex')}`;
    const appContext = { dispatchFence: 2, dispatchId: 'd-1', executionGeneration: 1 };
    expect(
      await resolveEmbeddedDispatchRoute(
        { userId },
        { appContext, heteroType: 'orvilo', operationTaskId: 'task-1' },
      ),
    ).toEqual({
      dispatchFence: 2,
      dispatchId: 'd-1',
      executionGeneration: 1,
      taskId: 'task-1',
    });
    // ACP/hetero kinds never match — their path is byte-identical.
    expect(
      await resolveEmbeddedDispatchRoute(
        { userId },
        { appContext, heteroType: 'claude-code', operationTaskId: 'task-1' },
      ),
    ).toBeNull();
    // Chat runs carry no task dispatch context; partial context does not admit.
    expect(
      await resolveEmbeddedDispatchRoute({ userId }, { appContext, heteroType: 'orvilo' }),
    ).toBeNull();
    expect(
      await resolveEmbeddedDispatchRoute(
        { userId },
        { appContext: { dispatchId: 'd-1' }, heteroType: 'orvilo', operationTaskId: 'task-1' },
      ),
    ).toBeNull();
  });
});

describe('openEmbeddedDispatchHost', () => {
  it('fails before launch with the real reason when no binding resolves', async () => {
    const run = await seedEmbeddedRun();
    const { artifact, root } = await fixtureDirectories();
    const { order, supervisor } = promptDrivingSupervisor();
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact, { supervisor: supervisor.factory })),
    );
    expect(prepared).toMatchObject({ error: { code: 'unauthorized' }, ok: false });
    expect(prepared.ok ? '' : prepared.error.message).toContain('provider binding');
    // Pre-launch failure: nothing was ever launched or handshake'd.
    expect(supervisor.state.launches).toHaveLength(0);
    expect(order).toEqual([]);
  });

  it('fails before launch on a stale dispatch fence', async () => {
    const run = await seedEmbeddedRun();
    await seedBinding(run.userId);
    const { artifact, root } = await fixtureDirectories();
    // A concurrent stop/advance already minted a newer fence.
    await db
      .update(taskDispatches)
      .set({ fence: 3, phase: 'cancel_requested' })
      .where(eq(taskDispatches.id, run.dispatchId));
    const { supervisor } = promptDrivingSupervisor();
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact, { supervisor: supervisor.factory })),
    );
    expect(prepared).toMatchObject({ error: { code: 'stale_fence' }, ok: false });
    expect(supervisor.state.launches).toHaveLength(0);
  });

  it('reuses the run grant a delegated dispatch already bound', async () => {
    const run = await seedEmbeddedRun({ delegateGrant: true });
    await seedBinding(run.userId);
    const { artifact, root } = await fixtureDirectories();
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact)),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.binding.grantId).toBe(run.executionGrantId);
    expect(prepared.value.binding.executionEpoch).toBe(run.executionEpoch);
    const grants = await db
      .select({ id: executionGrants.id })
      .from(executionGrants)
      .where(eq(executionGrants.taskId, run.taskId));
    expect(grants).toHaveLength(1);
    await prepared.value.host.shutdown().catch(() => {});
  });

  it('mints a bounded run grant for a manual run that lacks one', async () => {
    const run = await seedEmbeddedRun();
    await seedBinding(run.userId);
    const { artifact, root } = await fixtureDirectories();
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact)),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const [row] = await db
      .select({
        executionEpoch: taskTopics.executionEpoch,
        executionGrantId: taskTopics.executionGrantId,
      })
      .from(taskTopics)
      .where(eq(taskTopics.taskId, run.taskId));
    expect(row?.executionGrantId).toBe(prepared.value.binding.grantId);
    expect(row?.executionEpoch).toBe(prepared.value.binding.executionEpoch);
    await prepared.value.host.shutdown().catch(() => {});
  });
});

describe('driveEmbeddedCanonicalRun', () => {
  it('drives a full turn through the embedded host and the hetero ingest surface', async () => {
    const run = await seedEmbeddedRun();
    await seedBinding(run.userId);
    const { artifact, root } = await fixtureDirectories();
    const { order, supervisor } = promptDrivingSupervisor();
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact, { supervisor: supervisor.factory })),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.initModelId).toBe(MODEL_ID);

    await driveEmbeddedCanonicalRun(
      { database: db, userId: run.userId, workspaceId: run.workspaceId },
      prepared.value,
      {
        agentType: 'claude-code',
        assistantMessageId: run.assistantMessageId,
        operationId: run.operationId,
        prompt: 'say hi',
        topicId: run.topicId,
      },
    );

    // Harness vocabulary only — no ACP initialize/session/new on the wire.
    expect(order).toEqual(['harness.init', 'session.prompt']);
    expect(supervisor.state.terminated).toHaveLength(1);

    // The turn landed on the shared message surface exactly like a cloud run.
    const [assistant] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, run.assistantMessageId));
    expect(assistant?.content).toBe('hello world');
    expect(assistant?.model).toBe(MODEL_ID);
    expect(assistant?.provider).toBe('orvilo');
    const [operation] = await db
      .select({ metadata: agentOperations.metadata, status: agentOperations.status })
      .from(agentOperations)
      .where(eq(agentOperations.id, run.operationId));
    expect(operation?.status).toBe('done');
    const admission = isRecord(operation?.metadata)
      ? operation.metadata.remoteAdmission
      : undefined;
    expect(isRecord(admission) ? admission.state : undefined).toBe('running');
    const [topic] = await db
      .select({ metadata: topics.metadata })
      .from(topics)
      .where(eq(topics.id, run.topicId));
    const running = isRecord(topic?.metadata) ? topic.metadata.runningOperation : undefined;
    expect(running ?? undefined).toBeUndefined();
  });

  it('aborts inference mid-stream when the dispatch is stopped', async () => {
    const run = await seedEmbeddedRun();
    await seedBinding(run.userId);
    const { artifact, root } = await fixtureDirectories();
    const { supervisor } = promptDrivingSupervisor();
    // After the first text event lands, fence the dispatch exactly like the
    // production stop path: cancel_requested at fence+1.
    const backend = fakeBackend({
      between: async () => {
        await new TaskDispatchModel(db, run.workspaceId).requestStop({
          dispatchId: run.dispatchId,
          fence: run.dispatchFence,
          generation: run.executionGeneration,
          operationId: run.operationId,
          reason: 'user stop',
        });
      },
    });
    const prepared = await openEmbeddedDispatchHost(
      { database: db, userId: run.userId },
      openInput(run, environmentFor(root, artifact, { backend, supervisor: supervisor.factory })),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await driveEmbeddedCanonicalRun(
      { database: db, userId: run.userId, workspaceId: run.workspaceId },
      prepared.value,
      {
        agentType: 'claude-code',
        assistantMessageId: run.assistantMessageId,
        operationId: run.operationId,
        prompt: 'say hi',
        topicId: run.topicId,
      },
    );

    // The post-stop event failed the authority recheck — the turn ended in
    // error rather than silently completing, and the driver tolerated the
    // post-cancel drain miss on shutdown.
    const [operation] = await db
      .select({ status: agentOperations.status })
      .from(agentOperations)
      .where(eq(agentOperations.id, run.operationId));
    expect(operation?.status).toBe('error');
    const [assistant] = await db
      .select({ content: messages.content, error: messages.error })
      .from(messages)
      .where(eq(messages.id, run.assistantMessageId));
    expect(assistant?.content).toBe('hello ');
    expect(assistant?.error).toBeTruthy();
    expect(supervisor.state.terminated.length).toBeGreaterThan(0);
  }, 30_000);
});

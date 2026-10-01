// @vitest-environment node
/**
 * Phase 6 acceptance — dispatch-chain evidence.
 *
 * The flag flip is REAL: `FEATURE_FLAGS='+prime_embedded_dispatch'` in the
 * process environment, re-read through a fresh module registry — the same
 * env-var mechanism production uses (no vi.mock on the flag module).
 *
 * The route seam (`resolveEmbeddedDispatchRoute`) admits heteroType 'orvilo'
 * under the flag and provably denies everything else. The compose seam
 * (`openEmbeddedDispatchHost` + `driveEmbeddedCanonicalRun`) runs against the
 * REAL canonical rows (task/dispatch/taskTopics/operation/admission), the REAL
 * artifact verifier, a REAL SqlTrustedProviderBackend (real credential
 * decryption, real HTTP to the local stub provider), and launches the REAL
 * dist/runner.mjs child — the only substitution is realProcessSupervisor at the
 * documented Docker seam.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { getTestDB } from '@orvilo/database/test-utils';
import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
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
import {
  createRemoteRunAdmission,
  writeRemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';

import {
  directoriesFor,
  loadRunnerManifest,
  realProcessSupervisor,
  RUNNER_ARTIFACT,
  runnerAvailable,
  sseDelta,
  sseUsage,
  startStubProvider,
  type StubProvider,
} from './embeddedAcceptance.support';
import { driveEmbeddedCanonicalRun, openEmbeddedDispatchHost } from './embeddedDispatch';

const RUNNER_UP = runnerAvailable();
const db: OrviloDatabase = await getTestDB();
const MODEL_ID = 'mock-model-1';
const SECRET_VALUE = 'env-secret-7';

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const directories: string[] = [];
const seeded: Array<{ userId: string; workspaceId: string }> = [];
let originalDisableRedis: string | undefined;
let originalFlags: string | undefined;
let originalSecret: string | undefined;
let provider: StubProvider;

/** The flag evaluation path is module-cached for 5s — a real flip needs a
 * fresh module registry reading a changed process env. */
const routeWithFlag = async (flagValue: string | undefined) => {
  if (flagValue === undefined) delete process.env.FEATURE_FLAGS;
  else process.env.FEATURE_FLAGS = flagValue;
  vi.resetModules();
  return (await import('./embeddedDispatch')).resolveEmbeddedDispatchRoute;
};

const appContext = {
  dispatchFence: 2,
  dispatchId: randomUUID(),
  executionGeneration: 1,
};

/** Mirrors seedEmbeddedRun in embeddedDispatch.test.ts: the rows a real
 * runTask dispatch leaves behind at the moment the embedded seam fires. */
const seedDispatchRun = async () => {
  const userId = await createTestUser(db);
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'EmbeddedAcceptance', primaryOwnerId: userId, slug: randomUUID() })
    .returning();
  seeded.push({ userId, workspaceId: workspace.id });
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId: workspace.id });
  const agentId = `agt_${randomBytes(8).toString('hex')}`;
  await db.insert(agents).values({ id: agentId, userId, workspaceId: workspace.id });
  const topicId = `tpc_${randomBytes(8).toString('hex')}`;
  const operationId = `op_${Date.now()}_${agentId}_${topicId}_${randomBytes(6).toString('hex')}`;
  const assistantMessageId = `msg_${randomBytes(8).toString('hex')}`;
  const dispatchId = randomUUID();
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
      identifier: 'EMB-A1',
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
  return {
    assistantMessageId,
    dispatchFence: 2,
    dispatchId,
    executionGeneration: 1,
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
    name: 'Dispatch acceptance credential',
    payload: { values: { PROVIDER_KEY: SECRET_VALUE } },
    type: 'kv-env',
  });
  const config: ProviderBindingConfig = {
    enabled: false,
    endpoint: provider.endpoint,
    model: MODEL_ID,
    name: 'Embedded dispatch acceptance fixture',
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
  const [row] = await db.insert(providerBindings).values({ config, userId }).returning();
  return row;
};

beforeAll(async () => {
  originalSecret = process.env.KEY_VAULTS_SECRET;
  originalDisableRedis = process.env.DISABLE_REDIS;
  originalFlags = process.env.FEATURE_FLAGS;
  process.env.KEY_VAULTS_SECRET = randomBytes(32).toString('base64');
  // No broker in the test env — pin the in-memory stream manager so ingest's
  // publish path is exercised rather than failing against a dead Redis.
  process.env.DISABLE_REDIS = 'true';
  if (platformDescriptor)
    Object.defineProperty(process, 'platform', { configurable: true, get: () => 'linux' });
  for (const statement of TASK_EXECUTION_CONTROL_CANDIDATE_SQL) {
    await db.execute(sql.raw(statement));
  }
  provider = await startStubProvider();
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
  if (originalFlags === undefined) delete process.env.FEATURE_FLAGS;
  else process.env.FEATURE_FLAGS = originalFlags;
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  if (originalDisableRedis === undefined) delete process.env.DISABLE_REDIS;
  else process.env.DISABLE_REDIS = originalDisableRedis;
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  await provider.stop();
});

describe('embedded acceptance: dispatch flag flip (real env)', () => {
  it('flag unset → the route denies even an orvilo task dispatch', async () => {
    const route = await routeWithFlag(undefined);
    const admitted = await route(
      { userId: 'user-1' },
      {
        appContext,
        heteroType: 'orvilo',
        operationTaskId: 'task-1',
      },
    );
    expect(admitted).toBeNull();
  });

  it("FEATURE_FLAGS='+prime_embedded_dispatch' → orvilo admitted, hetero/ACP denied", async () => {
    const route = await routeWithFlag('+prime_embedded_dispatch');
    const admitted = await route(
      { userId: 'user-1' },
      {
        appContext,
        heteroType: 'orvilo',
        operationTaskId: 'task-1',
      },
    );
    expect(admitted).toEqual({
      dispatchFence: appContext.dispatchFence,
      dispatchId: appContext.dispatchId,
      executionGeneration: appContext.executionGeneration,
      taskId: 'task-1',
    });

    // Heterogeneous / ACP kinds never reach the embedded composition.
    for (const heteroType of ['claude-code', 'codex', 'acp']) {
      expect(
        await route({ userId: 'user-1' }, { appContext, heteroType, operationTaskId: 'task-1' }),
      ).toBeNull();
    }
    // Chat runs (no task) and context-less dispatches are excluded too.
    expect(await route({ userId: 'user-1' }, { appContext, heteroType: 'orvilo' })).toBeNull();
    expect(
      await route({ userId: 'user-1' }, { heteroType: 'orvilo', operationTaskId: 'task-1' }),
    ).toBeNull();
  });
});

describe.skipIf(!RUNNER_UP)(
  'embedded acceptance: dispatch composition (real child process)',
  () => {
    it(
      'orvilo dispatch composes + drives the REAL runner end to end',
      { timeout: 120_000 },
      async () => {
        const run = await seedDispatchRun();
        await seedBinding(run.userId);
        const dirs = await directoriesFor('dispatch');
        directories.push(dirs.root);
        const manifest = loadRunnerManifest();
        const supervisor = realProcessSupervisor({
          supervisorId: 'sup-dispatch-acceptance',
        });
        provider.setInferPlan(async (res) => {
          res.write(sseDelta('hello from dispatch'));
          res.write(sseUsage(4, 3));
          res.end();
        });

        const prepared = await openEmbeddedDispatchHost(
          { database: db, userId: run.userId },
          {
            dispatchFence: run.dispatchFence,
            dispatchId: run.dispatchId,
            environment: {
              artifact: RUNNER_ARTIFACT,
              executable: process.execPath,
              imageId: `runner.mjs@sha256:${manifest.sha256}`,
              runDirectory: dirs.root,
              supervisor: supervisor.supervisor,
            },
            executionGeneration: run.executionGeneration,
            model: MODEL_ID,
            operationId: run.operationId,
            provider: 'mock',
            taskId: run.taskId,
            topicId: run.topicId,
          },
        );
        if (!prepared.ok)
          console.error('embedded dispatch prepare failed:', prepared.error.message);
        expect(prepared.ok).toBe(true);
        if (!prepared.ok) return;
        expect(prepared.value.initModelId).toBe(MODEL_ID);

        // drive() itself calls host.start() — the real child launches inside
        // the driver, exactly like production.
        await driveEmbeddedCanonicalRun(
          { database: db, userId: run.userId, workspaceId: run.workspaceId },
          prepared.value,
          {
            agentType: 'claude-code',
            assistantMessageId: run.assistantMessageId,
            operationId: run.operationId,
            prompt: 'say hello',
            topicId: run.topicId,
          },
        );

        // The run produced through the real heteroIngest/heteroFinish surface:
        // assistant message carries the model stamp, operation is done, the
        // real child is terminated.
        const [assistant] = await db
          .select({ content: messages.content, model: messages.model })
          .from(messages)
          .where(eq(messages.id, run.assistantMessageId));
        expect(assistant?.content).toBe('hello from dispatch');
        expect(assistant?.model).toBe(MODEL_ID);
        const [operation] = await db
          .select({ status: agentOperations.status })
          .from(agentOperations)
          .where(eq(agentOperations.id, run.operationId));
        expect(operation?.status).toBe('done');
        expect(supervisor.state.terminatedTrees.length).toBeGreaterThan(0);
      },
    );
  },
);

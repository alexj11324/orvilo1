// @vitest-environment node
/**
 * Chat admission acceptance — the chat-parallel of
 * `embeddedAcceptance.dispatch.test.ts`.
 *
 * A `type:'orvilo'` CHAT run (topic-bound, no task rows anywhere) composes
 * `openEmbeddedChatDispatchHost` against the REAL `agent_operations` chat
 * execution record and drives the REAL dist/runner.mjs child end to end —
 * streamed reply through the shared heteroIngest/heteroFinish surface, the
 * operation settled, the chat-scoped registration stopped. Only
 * `realProcessSupervisor` substitutes at the documented Docker seam.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { getTestDB } from '@orvilo/database/test-utils';
import type { ProviderBindingConfig } from '@orvilo/types';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CredentialModel } from '@/database/models/credential';
import {
  agentOperations,
  agents,
  credentials,
  messages,
  providerBindings,
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
import { openEmbeddedChatDispatchHost } from './embeddedChatDispatch';
import { driveEmbeddedCanonicalRun } from './embeddedDispatch';

const RUNNER_UP = runnerAvailable();
const db: OrviloDatabase = await getTestDB();
const MODEL_ID = 'mock-model-1';
const SECRET_VALUE = 'env-secret-7';

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const directories: string[] = [];
const seeded: Array<{ userId: string; workspaceId: string | null }> = [];
let originalDisableRedis: string | undefined;
let originalSecret: string | undefined;
let provider: StubProvider;

/**
 * The rows a real `type:'orvilo'` chat dispatch leaves behind at the moment
 * the embedded chat seam fires: agent + topic + a running operation with
 * `taskId: null` — the chat-parallel execution record. No task, dispatch,
 * taskTopics, or grant rows exist; `metadata.executionControl` is minted by
 * `ChatExecutionControlModel.register` inside `host.open()`.
 */
const seedChatRun = async () => {
  const userId = await createTestUser(db);
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'EmbeddedChatAcceptance', primaryOwnerId: userId, slug: randomUUID() })
    .returning();
  seeded.push({ userId, workspaceId: workspace.id });
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId: workspace.id });
  const agentId = `agt_${randomBytes(8).toString('hex')}`;
  await db.insert(agents).values({ id: agentId, userId, workspaceId: workspace.id });
  const topicId = `tpc_${randomBytes(8).toString('hex')}`;
  const operationId = `op_${Date.now()}_${agentId}_${topicId}_${randomBytes(6).toString('hex')}`;
  const assistantMessageId = `msg_${randomBytes(8).toString('hex')}`;
  await db.insert(topics).values({
    agentId,
    id: topicId,
    metadata: { runningOperation: { assistantMessageId, operationId } },
    userId,
    workspaceId: workspace.id,
  });
  await db.insert(messages).values({
    agentId,
    content: '',
    id: assistantMessageId,
    role: 'assistant',
    topicId,
    userId,
    workspaceId: workspace.id,
  });
  await db.insert(agentOperations).values({
    agentId,
    id: operationId,
    status: 'running',
    taskId: null,
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
  return { agentId, assistantMessageId, operationId, topicId, userId, workspaceId: workspace.id };
};

const seedBinding = async (userId: string) => {
  const cred = await new CredentialModel(db, userId).create({
    key: `key_${randomBytes(4).toString('hex')}`,
    name: 'Chat dispatch acceptance credential',
    payload: { values: { PROVIDER_KEY: SECRET_VALUE } },
    type: 'kv-env',
  });
  const config: ProviderBindingConfig = {
    // Armed — `enabled` gates both binding resolution and issuance.
    enabled: true,
    endpoint: provider.endpoint,
    model: MODEL_ID,
    name: 'Embedded chat acceptance fixture',
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
    await db.delete(providerBindings).where(eq(providerBindings.userId, row.userId));
    await db.delete(credentials).where(eq(credentials.ownerUserId, row.userId));
    if (row.workspaceId) await db.delete(workspaces).where(eq(workspaces.id, row.workspaceId));
    await cleanupTestUser(db, row.userId);
  }
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.KEY_VAULTS_SECRET;
  else process.env.KEY_VAULTS_SECRET = originalSecret;
  if (originalDisableRedis === undefined) delete process.env.DISABLE_REDIS;
  else process.env.DISABLE_REDIS = originalDisableRedis;
  if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  await provider.stop();
});

describe.skipIf(!RUNNER_UP)('embedded acceptance: chat admission (real child process)', () => {
  it(
    'an orvilo chat run composes + drives the REAL runner end to end',
    { timeout: 120_000 },
    async () => {
      const run = await seedChatRun();
      await seedBinding(run.userId);
      const dirs = await directoriesFor('chat-dispatch');
      directories.push(dirs.root);
      const manifest = loadRunnerManifest();
      const supervisor = realProcessSupervisor({
        supervisorId: 'sup-chat-dispatch-acceptance',
      });
      provider.setInferPlan(async (res) => {
        res.write(sseDelta('hello from chat'));
        res.write(sseUsage(4, 3));
        res.end();
      });

      const prepared = await openEmbeddedChatDispatchHost(
        { database: db, userId: run.userId },
        {
          agentId: run.agentId,
          environment: {
            artifact: RUNNER_ARTIFACT,
            executable: process.execPath,
            imageId: `runner.mjs@sha256:${manifest.sha256}`,
            runDirectory: dirs.root,
            supervisor: supervisor.supervisor,
          },
          model: MODEL_ID,
          operationId: run.operationId,
          topicId: run.topicId,
        },
      );
      if (!prepared.ok)
        console.error('embedded chat dispatch prepare failed:', prepared.error.message);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.value.initModelId).toBe(MODEL_ID);

      // The chat-scoped registration was minted under
      // `agent_operations.metadata.executionControl` by host.open().
      const [operationBefore] = await db
        .select({ metadata: agentOperations.metadata })
        .from(agentOperations)
        .where(eq(agentOperations.id, run.operationId));
      const controlBefore = (operationBefore?.metadata as Record<string, unknown> | undefined)
        ?.executionControl as { state?: string } | undefined;
      expect(controlBefore?.state).toBe('registering');

      await driveEmbeddedCanonicalRun(
        { database: db, userId: run.userId, workspaceId: run.workspaceId },
        prepared.value,
        {
          agentType: 'orvilo',
          assistantMessageId: run.assistantMessageId,
          operationId: run.operationId,
          prompt: 'say hello',
          topicId: run.topicId,
        },
      );

      // Settle/stream parity with the task path: the assistant message
      // carries the streamed content + model stamp, the operation row (the
      // chat kill fence) settled, the real child terminated.
      const [assistant] = await db
        .select({ content: messages.content, model: messages.model })
        .from(messages)
        .where(eq(messages.id, run.assistantMessageId));
      expect(assistant?.content).toBe('hello from chat');
      expect(assistant?.model).toBe(MODEL_ID);
      const [operation] = await db
        .select({ metadata: agentOperations.metadata, status: agentOperations.status })
        .from(agentOperations)
        .where(eq(agentOperations.id, run.operationId));
      expect(operation?.status).toBe('done');
      // The operation status IS the chat kill fence: the settle already
      // advanced it, so drain's `registration.stop` miss (logged, not
      // thrown) leaves the blob at its last activated state — identical to
      // the task path's post-settle dispatch-fence miss.
      const control = (operation?.metadata as Record<string, unknown> | undefined)
        ?.executionControl as { state?: string } | undefined;
      expect(control?.state).toBe('running');
      expect(supervisor.state.terminatedTrees.length).toBeGreaterThan(0);
    },
  );
});

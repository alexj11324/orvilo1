// @vitest-environment node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import * as schema from '../../schemas';
import {
  agents,
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { TASK_EXECUTION_CONTROL_CANDIDATE_SQL } from '../../schemas/taskExecutionControl';
import type { OrviloDatabase } from '../../type';
import {
  type RuntimeRunBinding,
  subjectTaskId,
  TaskExecutionControlModel,
} from '../taskExecutionControl';
import { TaskTopicModel } from '../taskTopic';

const db = await getTestDB();
for (const statement of TASK_EXECUTION_CONTROL_CANDIDATE_SQL) {
  await db.execute(sql.raw(statement));
}
let b: RuntimeRunBinding;
const identity = {
  treeId: 'source-tree',
  supervisorId: 'trusted-supervisor',
  sessionId: 'source-session',
};
const model = () => new TaskExecutionControlModel(db, b.userId, b.workspaceId);
const intent = () => ({
  id: randomUUID(),
  successorOwnerId: 'successor',
  successorRegistrationId: randomUUID(),
  successorLeaseId: randomUUID(),
  leaseMs: 60_000,
});
const proof = () => ({
  ...identity,
  observedAt: Date.now(),
  remainingProcesses: 0,
  pendingActions: 0,
});
async function quiescent() {
  const i = intent();
  await model().beginHandoff(b, i);
  await model().advance(i.id, 0, 'quiescing');
  await model().advance(i.id, 1, 'quiescent', proof());
  return i;
}
beforeEach(async () => {
  const userId = randomUUID();
  await db.insert(users).values({ id: userId });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'handoff', slug: randomUUID(), primaryOwnerId: userId })
    .returning();
  const [member] = await db
    .insert(workspaceMembers)
    .values({ userId, workspaceId: workspace.id, role: 'owner' })
    .returning();
  const agentId = randomUUID();
  const topicId = randomUUID();
  await db.insert(agents).values({ id: agentId, userId, workspaceId: workspace.id });
  await db.insert(topics).values({ id: topicId, userId, workspaceId: workspace.id });
  const [task] = await db
    .insert(tasks)
    .values({
      workspaceId: workspace.id,
      createdByUserId: userId,
      identifier: 'HANDOFF-1',
      seq: 1,
      instruction: 'fixture',
      status: 'running',
      assigneeAgentId: agentId,
      currentTopicId: topicId,
      executionGeneration: 1,
    })
    .returning();
  const dispatchId = randomUUID();
  const operationId = randomUUID();
  await db.insert(taskDispatches).values({
    id: dispatchId,
    workspaceId: workspace.id,
    taskId: task.id,
    agentId,
    phase: 'running',
    generation: 1,
    fence: 2,
    taskRevision: task.domainRevision,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
    operationId,
    idempotencyKey: randomUUID(),
    requestedBy: `manual:${userId}`,
  });
  const [grant] = await db
    .insert(executionGrants)
    .values({
      workspaceId: workspace.id,
      taskId: task.id,
      agentId,
      initiatedBy: userId,
      delegationSubjectType: 'user',
      delegationSubjectId: userId,
      allowedActions: ['run'],
      authzVersions: { workspaceAuthzVersion: member.authzVersion },
      expiresAt: new Date(Date.now() + 300_000),
    })
    .returning();
  await db.insert(taskTopics).values({
    taskId: task.id,
    topicId,
    userId,
    workspaceId: workspace.id,
    seq: 1,
    operationId,
    dispatchId,
    dispatchFence: 2,
    executionGeneration: 1,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
    executionGrantId: grant.id,
    executionEpoch: 1,
  });
  b = {
    workspaceId: workspace.id,
    userId,
    subject: { dispatchId, kind: 'task', taskId: task.id },
    topicId,
    dispatchId,
    operationId,
    grantId: grant.id,
    dispatchFence: 2,
    generation: 1,
    executionEpoch: 1,
    policyRevision: task.policyRevision,
    stateRevision: task.domainRevision,
    runtimeOwnerId: 'source',
    runtimeRegistrationId: randomUUID(),
    runtimeLeaseId: randomUUID(),
  };
  await model().register(b, 60_000);
  await model().activate(b, identity);
});
afterEach(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, b.workspaceId));
  await db.delete(users).where(eq(users.id, b.userId));
});
describe('canonical durable runtime handoff', () => {
  it('recovers each phase with a fresh model and transfers owner and epoch atomically', async () => {
    const i = await quiescent();
    expect((await model().readControl(b))?.control?.ownerId).toBe('source');
    const moved = await model().transfer(i.id, 2);
    expect(moved.epoch).toBe(2);
    expect(moved.control.state).toBe('registering');
    expect((await model().beginHandoff(b, i)).phase).toBe('transferred');
    await expect(model().activate(b, identity)).rejects.toThrow();
    await expect(model().transfer(i.id, 2)).rejects.toThrow();
    const resumed = await model().resume(i.id, 3, { ...identity, treeId: 'successor-tree' });
    expect(resumed.record.phase).toBe('resumed');
    expect(resumed.control.ownerId).toBe('successor');
    expect(resumed.control.activeHandoffId).toBeNull();
  });
  it('allows only one concurrent handoff intent', async () => {
    const results = await Promise.allSettled([
      model().beginHandoff(b, intent()),
      model().beginHandoff(b, intent()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await model().readControl(b))?.control?.state).toBe('held');
  });
  it('rejects stale, future, wrong-tree and undrained proofs without advancing', async () => {
    const i = intent();
    await model().beginHandoff(b, i);
    await model().advance(i.id, 0, 'quiescing');
    for (const patch of [
      { treeId: 'foreign' },
      { pendingActions: 1 },
      { observedAt: 0 },
      { observedAt: Date.now() + 100_000 },
    ]) {
      await expect(
        model().advance(i.id, 1, 'quiescent', { ...proof(), ...patch }),
      ).rejects.toThrow();
    }
    expect((await model().read(i.id))?.phase).toBe('quiescing');
  });
  it.each(['revoked', 'expired', 'membership'] as const)(
    'denies transfer after %s authority changes',
    async (change) => {
      const i = await quiescent();
      if (change === 'revoked')
        await db
          .update(executionGrants)
          .set({ status: 'revoked' })
          .where(eq(executionGrants.id, b.grantId));
      if (change === 'membership')
        await db
          .update(workspaceMembers)
          .set({ authzVersion: 99 })
          .where(eq(workspaceMembers.workspaceId, b.workspaceId));
      if (change === 'expired') {
        const state = await model().readControl(b);
        await db
          .update(taskTopics)
          .set({ executionControl: { ...state!.control!, leaseExpiresAt: 1 } })
          .where(eq(taskTopics.topicId, b.topicId));
      }
      await expect(model().transfer(i.id, 2)).rejects.toThrow();
      expect((await model().readControl(b))?.epoch).toBe(1);
    },
  );
  it('denies successor resume after grant revocation', async () => {
    const i = await quiescent();
    await model().transfer(i.id, 2);
    await db
      .update(executionGrants)
      .set({ status: 'revoked' })
      .where(eq(executionGrants.id, b.grantId));
    await expect(model().resume(i.id, 3, identity)).rejects.toThrow();
    expect((await model().read(i.id))?.phase).toBe('transferred');
  });
  it('rolls back owner, lease, epoch and phase when durable transfer history fails', async () => {
    const i = await quiescent();
    const before = await model().readControl(b);
    const trigger = `handoff_fault_${randomUUID().replaceAll('-', '')}`;
    const functionName = `${trigger}_fn`;
    await db.execute(
      sql.raw(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${i.id}' AND NEW.phase = 'transferred' THEN RAISE EXCEPTION 'fixture transfer history failure'; END IF;
        RETURN NEW;
      END $$`),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${trigger} BEFORE UPDATE ON task_execution_handoffs FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
      ),
    );
    try {
      await expect(model().transfer(i.id, 2)).rejects.toThrow();
      expect(await model().readControl(b)).toEqual(before);
      expect((await model().read(i.id))?.phase).toBe('quiescent');
      expect((await model().read(i.id))?.revision).toBe(2);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON task_execution_handoffs`));
      await db.execute(sql.raw(`DROP FUNCTION ${functionName}()`));
    }
    const retried = await model().transfer(i.id, 2);
    expect(retried.epoch).toBe(b.executionEpoch + 1);
    expect(retried.control.ownerId).toBe(i.successorOwnerId);
    expect(retried.control.leaseId).toBe(i.successorLeaseId);
    expect(retried.record.phase).toBe('transferred');
  });

  it('prevents stale source stopping successor and permits idempotent successor stop', async () => {
    const i = await quiescent();
    const moved = await model().transfer(i.id, 2);
    const successorIdentity = { ...identity, treeId: 'successor-tree' };
    const resumed = await model().resume(i.id, 3, successorIdentity);
    expect(await model().resume(i.id, 3, successorIdentity)).toEqual(resumed);
    await expect(model().resume(i.id, 3, identity)).rejects.toThrow();
    await expect(model().stop(b)).rejects.toThrow();
    const [before] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.id, b.dispatchId));
    expect(before.phase).toBe('running');
    const successor = {
      ...b,
      executionEpoch: moved.epoch,
      runtimeOwnerId: i.successorOwnerId,
      runtimeLeaseId: i.successorLeaseId,
      runtimeRegistrationId: i.successorRegistrationId,
    };
    const stopped = await model().stop(successor);
    if (!stopped) throw new Error('Successor stop did not return the fenced dispatch');
    expect(stopped.phase).toBe('cancel_requested');
    expect(stopped.fence).toBe(b.dispatchFence + 1);
    const replayedStop = await model().stop(successor);
    if (!replayedStop) throw new Error('Repeated stop lost the fenced dispatch');
    expect(replayedStop.fence).toBe(stopped.fence);
    expect((await model().readControl(successor))?.control?.state).toBe('stopped');
  });

  it('renews only the live owner and rejects held or expired leases', async () => {
    await expect(model().renew({ ...b, runtimeOwnerId: 'foreign' }, 100_000)).rejects.toThrow();
    const renewed = await model().renew(b, 100_000);
    expect(renewed.leaseId).toBe(b.runtimeLeaseId);
    expect(renewed.leaseExpiresAt).toBeGreaterThan(Date.now());
    await db
      .update(taskTopics)
      .set({ executionControl: { ...renewed, leaseExpiresAt: 1 } })
      .where(eq(taskTopics.topicId, b.topicId));
    await expect(model().renew(b, 100_000)).rejects.toThrow();
    await db
      .update(taskTopics)
      .set({ executionControl: renewed })
      .where(eq(taskTopics.topicId, b.topicId));
    await model().beginHandoff(b, intent());
    await expect(model().renew(b, 100_000)).rejects.toThrow();
  });

  it('allows the exact process owner to stop after its grant is revoked', async () => {
    await db
      .update(executionGrants)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(executionGrants.id, b.grantId));
    await expect(model().renew(b, 60_000)).rejects.toThrow();
    const stopped = await model().stop(b);
    if (!stopped) throw new Error('Revoked owner cleanup did not return the fenced dispatch');
    expect(stopped.phase).toBe('cancel_requested');
    expect(stopped.fence).toBe(b.dispatchFence + 1);
    expect((await model().readControl(b))?.control?.state).toBe('stopped');
  });
  it.runIf(process.env.TEST_SERVER_DB === '1')(
    'rolls back an actual terminated PostgreSQL backend mid-transfer and retries on a fresh connection',
    async () => {
      const i = await quiescent();
      const before = await model().readControl(b);
      const nonce = randomUUID().replaceAll('-', '');
      const trigger = `handoff_crash_${nonce}`;
      const applicationName = `handoff_crash_${nonce}`;
      const pool = new Pool({
        connectionString: process.env.DATABASE_TEST_URL,
        max: 1,
        application_name: applicationName,
      });
      const connectionErrors: Error[] = [];
      pool.on('error', (error) => connectionErrors.push(error));
      pool.on('connect', (client) => client.on('error', (error) => connectionErrors.push(error)));
      const isolatedDB = drizzle(pool, { schema }) as unknown as OrviloDatabase;
      const victim = new TaskExecutionControlModel(isolatedDB, b.userId, b.workspaceId);
      await db.execute(
        sql.raw(`CREATE FUNCTION ${trigger}_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${i.id}' AND NEW.phase = 'transferred' THEN PERFORM pg_sleep(30); END IF;
        RETURN NEW;
      END $$`),
      );
      await db.execute(
        sql.raw(
          `CREATE TRIGGER ${trigger} BEFORE UPDATE ON task_execution_handoffs FOR EACH ROW EXECUTE FUNCTION ${trigger}_fn()`,
        ),
      );
      let interrupted: Promise<unknown> | undefined;
      try {
        interrupted = victim.transfer(i.id, 2).then(
          () => 'unexpected-commit',
          (error: unknown) => error,
        );
        let pid: number | undefined;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await db.execute(
            sql`SELECT pid FROM pg_stat_activity WHERE application_name = ${applicationName} AND wait_event = 'PgSleep'`,
          );
          pid = (rows.rows[0] as { pid: number } | undefined)?.pid;
          if (pid) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(pid).toBeTypeOf('number');
        if (!pid) throw new Error('Transfer did not reach the scoped history fault');
        await db.execute(sql`SELECT pg_terminate_backend(${pid})`);
        expect(await interrupted).toBeInstanceOf(Error);
        expect(await model().readControl(b)).toEqual(before);
        expect((await model().read(i.id))?.phase).toBe('quiescent');
      } finally {
        // Terminate only this unique fixture connection if an assertion failed before the kill.
        await db.execute(
          sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = ${applicationName}`,
        );
        await interrupted;
        await pool.end();
        await db.execute(sql.raw(`DROP TRIGGER ${trigger} ON task_execution_handoffs`));
        await db.execute(sql.raw(`DROP FUNCTION ${trigger}_fn()`));
      }
      for (const error of connectionErrors) expect(error.message).toMatch(/terminat/i);
      const reopenedPool = new Pool({ connectionString: process.env.DATABASE_TEST_URL, max: 1 });
      try {
        const reopened = new TaskExecutionControlModel(
          drizzle(reopenedPool, { schema }) as unknown as OrviloDatabase,
          b.userId,
          b.workspaceId,
        );
        expect(await reopened.readControl(b)).toEqual(before);
        const retried = await reopened.transfer(i.id, 2);
        expect(retried.epoch).toBe(b.executionEpoch + 1);
        expect(retried.control.ownerId).toBe(i.successorOwnerId);
      } finally {
        await reopenedPool.end();
      }
    },
    15_000,
  );
  it('fences legacy startRun from overwriting registered Core ownership', async () => {
    const before = await model().readControl(b);
    await expect(
      new TaskTopicModel(db, b.userId, b.workspaceId).startRun(subjectTaskId(b), b.topicId, {
        seq: 1,
        operationId: 'legacy-other-operation',
        dispatch: {
          id: b.dispatchId,
          fence: b.dispatchFence + 1,
          generation: b.generation,
          planRevision: null,
          policyRevision: b.policyRevision,
          requirementRevision: 0,
          taskRevision: b.stateRevision,
        },
      }),
    ).rejects.toThrow('cannot be overwritten');
    expect(await model().readControl(b)).toEqual(before);
    const [topic] = await db.select().from(taskTopics).where(eq(taskTopics.topicId, b.topicId));
    expect(topic.operationId).toBe(b.operationId);
    expect(topic.dispatchFence).toBe(b.dispatchFence);
  });

  it.runIf(process.env.TEST_SERVER_DB === '1')(
    'continues every durable phase after killing and replacing the client process',
    async () => {
      const i = intent();
      const phases = ['prepared', 'quiescing', 'quiescent', 'transferred', 'resumed'] as const;
      for (const phase of phases) {
        // A test child allowlist is not the application's augmented ambient environment.
        const childEnvironment: Record<string, string | undefined> = {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          DATABASE_TEST_URL: process.env.DATABASE_TEST_URL,
          HANDOFF_CRASH_INPUT: JSON.stringify({ binding: b, intent: i, stage: phase }),
        };
        const child = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            fileURLToPath(new URL('./fixtures/handoffCrashChild.ts', import.meta.url)),
          ],
          {
            cwd: fileURLToPath(new URL('../../../../..', import.meta.url)),
            stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            env: childEnvironment as NodeJS.ProcessEnv,
          },
        );
        let errors = '';
        child.stderr?.on('data', (chunk) => {
          errors = (errors + String(chunk)).slice(-4000);
        });
        const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
          child.once('exit', (code, signal) => resolve({ code, signal })),
        );
        try {
          const message = await new Promise<{ phase: string }>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`Child phase ${phase} timed out: ${errors}`)),
              15_000,
            );
            child.once('message', (value) => {
              clearTimeout(timer);
              resolve(value as { phase: string });
            });
            child.once('error', (error) => {
              clearTimeout(timer);
              reject(error);
            });
            child.once('exit', () => {
              clearTimeout(timer);
              reject(new Error(`Child exited before commit: ${errors}`));
            });
          });
          expect(message.phase).toBe(phase);
          child.kill('SIGKILL');
          expect((await exited).signal).toBe('SIGKILL');
          // Observe committed state from another connection after the worker is dead.
          expect((await model().read(i.id))?.phase).toBe(phase);
          const state = await model().readControl(b);
          expect(state?.epoch).toBe(phase === 'transferred' || phase === 'resumed' ? 2 : 1);
          expect(state?.control?.ownerId).toBe(
            phase === 'transferred' || phase === 'resumed' ? i.successorOwnerId : b.runtimeOwnerId,
          );
        } finally {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          await exited;
        }
      }
      const replay = await model().resume(i.id, 3, { ...identity, treeId: 'successor-tree' });
      expect(replay.epoch).toBe(2);
      expect(replay.record.revision).toBe(4);
    },
    90_000,
  );
});

// @vitest-environment node
import { eq, type SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskDispatches, tasks, users } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import {
  legacyStatusExpr,
  predicateForLegacyStatus,
  predicateForLegacyStatuses,
} from '../taskExecutionSql';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'task-exec-sql-user';

const dispatch = async (
  taskId: string,
  phase: 'running' | 'waiting' | 'failed' | 'canceled' | 'succeeded',
  generation = 1,
) => {
  await serverDB.insert(taskDispatches).values({
    generation,
    id: `disp_${taskId}_${phase}_${generation}`,
    idempotencyKey: `idem_${taskId}_${phase}_${generation}`,
    phase,
    policyRevision: 1,
    requestedBy: 'task-execution-sql-test',
    requirementRevision: 1,
    taskId,
    taskRevision: 1,
  });
};

const rawStatus = async (id: string) => {
  const [row] = await serverDB.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, id));
  return row?.status;
};

const derivedStatus = async (id: string) => {
  const [row] = await serverDB
    .select({ status: legacyStatusExpr })
    .from(tasks)
    .where(eq(tasks.id, id));
  return row?.status;
};

const matchingIds = async (predicate: SQL | undefined) => {
  const rows = await serverDB.select({ id: tasks.id }).from(tasks).where(predicate);
  return rows.map(({ id }) => id);
};

const setStaleStatus = async (id: string, status: string) => {
  await serverDB.update(tasks).set({ status }).where(eq(tasks.id, id));
};

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('task execution SQL projection (tasks.status retired)', () => {
  it('derives the legacy vocabulary from canonical fields, never the column', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Derive me' });
    // A contradictory stale value must not win: the column is dead.
    await setStaleStatus(task.id, 'running');

    expect(await derivedStatus(task.id)).toBe('backlog');

    await dispatch(task.id, 'running');
    expect(await derivedStatus(task.id)).toBe('running');
  });

  it('reads a waiting reservation as waiting without changing the execution ownership projection', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Waiting for project policy' });
    await dispatch(task.id, 'waiting');

    expect(await model.findById(task.id)).toMatchObject({
      dispatchPhase: 'waiting',
      status: 'running',
      workflowCategory: 'backlog',
    });
    expect(await matchingIds(predicateForLegacyStatus('running'))).toContain(task.id);
  });

  it('keeps the stored column frozen through every transition write', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Frozen column' });

    await model.updateStatus(task.id, 'paused');
    expect(await rawStatus(task.id)).toBe('backlog');
    expect(await derivedStatus(task.id)).toBe('paused');

    await model.updateStatus(task.id, 'completed');
    expect(await rawStatus(task.id)).toBe('backlog');
    expect(await derivedStatus(task.id)).toBe('completed');
  });

  it('maps the terminal transitions onto the Issue category', async () => {
    const model = new TaskModel(serverDB, userId);
    const completed = await model.create({ instruction: 'Done' });
    await model.updateStatus(completed.id, 'completed');
    const canceled = await model.create({ instruction: 'Canceled' });
    await model.updateStatus(canceled.id, 'canceled');

    expect((await model.findById(completed.id))?.workflowCategory).toBe('done');
    expect((await model.findById(canceled.id))?.workflowCategory).toBe('canceled');
  });

  it('keeps an explicit workflowCategory over the transition default', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Explicit wins' });

    await model.updateStatus(task.id, 'completed', { workflowCategory: 'in_review' });

    expect((await model.findById(task.id))?.workflowCategory).toBe('in_review');
  });

  it('matches each legacy predicate against canonical truth only', async () => {
    const model = new TaskModel(serverDB, userId);
    const parked = await model.create({ instruction: 'Parked' });
    await model.updateStatus(parked.id, 'paused');
    await setStaleStatus(parked.id, 'running');

    // Stale 'running' in the column cannot fabricate execution or Issue Status.
    expect(await matchingIds(predicateForLegacyStatus('running'))).not.toContain(parked.id);
    expect(await matchingIds(predicateForLegacyStatus('paused'))).toContain(parked.id);
    expect(await matchingIds(predicateForLegacyStatus('backlog'))).not.toContain(parked.id);

    const live = await model.create({ instruction: 'Live' });
    await setStaleStatus(live.id, 'canceled');
    await dispatch(live.id, 'running');
    expect(await matchingIds(predicateForLegacyStatus('running'))).toContain(live.id);
    expect(await matchingIds(predicateForLegacyStatus('canceled'))).not.toContain(live.id);

    const done = await model.create({ instruction: 'Done' });
    await model.updateStatus(done.id, 'completed');
    expect(await matchingIds(predicateForLegacyStatus('completed'))).toContain(done.id);
    expect(await matchingIds(predicateForLegacyStatus('backlog'))).not.toContain(done.id);
  });

  it('composes predicate sets without double counting', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Composed' });
    await model.updateStatus(task.id, 'paused');

    expect(await matchingIds(predicateForLegacyStatuses(['paused', 'running']))).toContain(task.id);
    expect(await matchingIds(predicateForLegacyStatuses(['paused', 'paused']))).toContain(task.id);
    expect(predicateForLegacyStatuses([])).toBeUndefined();
  });

  it('guards updateStatusIfCurrent on canonical execution, not the stale column', async () => {
    const model = new TaskModel(serverDB, userId);
    const task = await model.create({ instruction: 'Guarded' });
    await setStaleStatus(task.id, 'running');

    // Column says running; canonical execution says no dispatch exists — the
    // stale value must not satisfy the 'running' guard.
    expect(await model.updateStatusIfCurrent(task.id, 'running', 'paused')).toBeNull();

    await dispatch(task.id, 'running');
    const paused = await model.updateStatusIfCurrent(task.id, 'running', 'paused');
    expect(paused).not.toBeNull();
    expect(await derivedStatus(task.id)).toBe('paused');
  });

  it('translates a create-time status preset without writing the column', async () => {
    const model = new TaskModel(serverDB, userId);
    const parked = await model.create({ instruction: 'Pre-parked', status: 'paused' });
    const done = await model.create({ instruction: 'Pre-completed', status: 'completed' });
    const open = await model.create({ instruction: 'Ordinary' });

    expect(await rawStatus(parked.id)).toBe('backlog');
    expect(await derivedStatus(parked.id)).toBe('paused');
    expect((await model.findById(done.id))?.workflowCategory).toBe('done');
    expect(await derivedStatus(open.id)).toBe('backlog');
  });
});

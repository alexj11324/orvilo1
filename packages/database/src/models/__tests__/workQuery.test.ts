// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { tasks } from '../../schemas';
import { agents, users, workspaces } from '../../schemas';
import { actionApprovals } from '../../schemas/actionApproval';
import { executionGrants } from '../../schemas/executionGrant';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { myWorkQueryForMode, WorkQueryError, WorkQueryModel } from '../workQuery';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'work-query-user';
const otherUserId = 'work-query-other';
const workspaceId = 'work-query-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Query WS',
    primaryOwnerId: userId,
    slug: 'work-query-ws',
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

const createTask = async (owner: string, values: Partial<typeof tasks.$inferInsert> = {}) => {
  const model = new TaskModel(serverDB, owner, workspaceId);
  return model.create({ instruction: values.instruction ?? 'Do the work', ...values });
};

describe('validateWorkQuery', () => {
  it('rejects unknown fields instead of silently widening', async () => {
    await expect(
      new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
        query: {
          entityType: 'task',
          filter: { all: [{ field: 'secretColumn' as never, op: 'eq', value: 'x' }] },
          schemaVersion: 1,
        },
      }),
    ).rejects.toBeInstanceOf(WorkQueryError);
  });
});

describe('WorkQueryModel', () => {
  it('lists assigned tasks for the visitor, not the view owner', async () => {
    const mine = await createTask(userId, { assigneeUserId: userId, name: 'Mine' });
    await createTask(userId, { assigneeUserId: otherUserId, name: 'Theirs' });

    const asMe = new WorkQueryModel(serverDB, userId, workspaceId);
    const asOther = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const query = myWorkQueryForMode('assigned');

    const mineResult = await asMe.queryTasks({ query });
    const otherResult = await asOther.queryTasks({ query });

    expect(mineResult.tasks.map((row) => row.id)).toEqual([mine.id]);
    expect(otherResult.tasks.map((row) => row.name)).toEqual(['Theirs']);
    expect(mineResult.queryHash).toBe(otherResult.queryHash);
  });

  it('treats delegated work as an explicit grant, not agent ownership', async () => {
    await serverDB.insert(agents).values({ id: 'agt_shared', slug: 'shared', userId });
    const someoneElses = await createTask(otherUserId, {
      assigneeAgentId: 'agt_shared',
      name: 'Not mine',
    });
    const granted = await createTask(otherUserId, { name: 'I asked for this' });
    await serverDB.insert(executionGrants).values({
      agentId: 'agt_shared',
      id: 'grant-delegated',
      initiatedBy: userId,
      status: 'active',
      taskId: granted.id,
      workspaceId,
    });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      mode: 'delegated',
      query: myWorkQueryForMode('delegated'),
    });

    expect(result.tasks.map((row) => row.id)).toEqual([granted.id]);
    expect(result.tasks.map((row) => row.id)).not.toContain(someoneElses.id);
  });

  it('keeps review responsibility even when the inbox row is gone', async () => {
    const reviewed = await createTask(otherUserId, {
      name: 'Needs review',
      reviewerUserId: userId,
    });
    await serverDB.insert(actionApprovals).values({
      actionType: 'tool.danger',
      approverUserId: userId,
      id: 'apr_pending',
      status: 'pending',
      targetId: reviewed.id,
      targetType: 'task',
      workspaceId,
    });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: myWorkQueryForMode('review'),
    });

    expect(result.tasks.map((row) => row.id)).toContain(reviewed.id);
  });
});

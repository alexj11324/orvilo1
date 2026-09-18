// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { SavedViewModel } from '../savedView';
import { TaskModel } from '../task';

const serverDB: OrviloDatabase = await getTestDB();
const ownerId = 'view-owner';
const visitorId = 'view-visitor';
const workspaceId = 'view-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: ownerId }, { id: visitorId }]);
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Views',
    primaryOwnerId: ownerId,
    slug: 'view-ws',
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('SavedViewModel', () => {
  it('evaluates currentUser as the visitor, not the view owner', async () => {
    const ownerTasks = new TaskModel(serverDB, ownerId, workspaceId);
    const visitorTasks = new TaskModel(serverDB, visitorId, workspaceId);
    await ownerTasks.create({ assigneeUserId: ownerId, instruction: 'Owner work', name: 'Owner' });
    await visitorTasks.create({
      assigneeUserId: visitorId,
      instruction: 'Visitor work',
      name: 'Visitor',
    });

    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const view = await ownerViews.create({
      entityType: 'task',
      name: 'Assigned to me',
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] },
        schemaVersion: 1,
      },
      visibility: 'workspace',
    });

    const visitorViews = new SavedViewModel(serverDB, visitorId, workspaceId);
    const asOwner = await ownerViews.evaluate(view);
    const asVisitor = await visitorViews.evaluate((await visitorViews.findById(view.id))!);

    expect(asOwner.tasks?.map((row) => row.name)).toEqual(['Owner']);
    expect(asVisitor.tasks?.map((row) => row.name)).toEqual(['Visitor']);
  });

  it('marks a broken filter as needsRepair instead of returning the whole workspace', async () => {
    const model = new SavedViewModel(serverDB, ownerId, workspaceId);
    await new TaskModel(serverDB, ownerId, workspaceId).create({
      instruction: 'Should not leak',
      name: 'Secret',
    });
    const view = await model.create({
      entityType: 'task',
      name: 'Broken',
      query: { entityType: 'task', schemaVersion: 1 },
    });
    const broken = {
      ...view,
      queryAst: {
        entityType: 'task' as const,
        filter: { all: [{ field: 'deletedField' as never, op: 'eq' as const, value: 'x' }] },
        schemaVersion: 1 as const,
      },
    };
    const result = await model.evaluate(broken);
    expect(result.needsRepair).toBe(true);
    expect(result.tasks).toEqual([]);
    expect(result.total).toBe(0);
  });
});

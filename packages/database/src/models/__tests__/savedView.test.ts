// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { SavedViewBuiltinError, SavedViewConflictError, SavedViewModel } from '../savedView';
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

  it('rejects a stale definitionVersion instead of last-write-wins', async () => {
    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const view = await ownerViews.create({
      entityType: 'task',
      name: 'Original',
      query: { entityType: 'task', schemaVersion: 1 },
    });
    expect(view.definitionVersion).toBe(1);

    const saved = await ownerViews.update(view.id, {
      expectedDefinitionVersion: 1,
      name: 'Renamed',
    });
    expect(saved?.name).toBe('Renamed');
    expect(saved?.definitionVersion).toBe(2);

    await expect(
      ownerViews.update(view.id, { expectedDefinitionVersion: 1, name: 'Stale write' }),
    ).rejects.toBeInstanceOf(SavedViewConflictError);

    const current = await ownerViews.findById(view.id);
    expect(current?.name).toBe('Renamed');
    expect(current?.definitionVersion).toBe(2);
  });

  it('saves a repaired query AST under CAS instead of last-write-wins', async () => {
    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const view = await ownerViews.create({
      entityType: 'task',
      name: 'Broken then fixed',
      query: { entityType: 'task', schemaVersion: 1 },
    });
    const repaired = await ownerViews.update(view.id, {
      expectedDefinitionVersion: 1,
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] },
        schemaVersion: 1,
      },
    });
    expect(repaired?.definitionVersion).toBe(2);
    expect(repaired?.queryAst.filter).toEqual({
      all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });

    await expect(
      ownerViews.update(view.id, {
        expectedDefinitionVersion: 1,
        query: { entityType: 'task', schemaVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(SavedViewConflictError);
  });

  it('does not let a visitor update another owners view', async () => {
    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const view = await ownerViews.create({
      entityType: 'task',
      name: 'Owner view',
      query: { entityType: 'task', schemaVersion: 1 },
      visibility: 'workspace',
    });
    const visitorViews = new SavedViewModel(serverDB, visitorId, workspaceId);
    await expect(
      visitorViews.update(view.id, { expectedDefinitionVersion: 1, name: 'Hijacked' }),
    ).resolves.toBeUndefined();
    expect((await ownerViews.findById(view.id))?.name).toBe('Owner view');
  });

  it('redacts private task ids from a shared view definition', async () => {
    const ownerTasks = new TaskModel(serverDB, ownerId, workspaceId);
    const secret = await ownerTasks.create({
      instruction: 'Keep this title off the visitor AST',
      name: 'Secret task',
      visibility: 'private',
    });
    const open = await ownerTasks.create({
      instruction: 'Visible work',
      name: 'Open task',
      visibility: 'public',
    });
    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const view = await ownerViews.create({
      entityType: 'task',
      name: 'Mixed ids',
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'id', op: 'in', value: [secret.id, open.id] }] },
        schemaVersion: 1,
      },
      visibility: 'workspace',
    });

    const visitorViews = new SavedViewModel(serverDB, visitorId, workspaceId);
    const presented = await visitorViews.present((await visitorViews.findById(view.id))!);
    const serialized = JSON.stringify(presented.queryAst);
    expect(serialized).not.toContain(secret.id);
    expect(serialized).toContain(open.id);

    const asVisitor = await visitorViews.evaluate((await visitorViews.findById(view.id))!);
    expect(asVisitor.tasks?.map((row) => row.id)).toEqual([open.id]);
    expect(asVisitor.tasks?.map((row) => row.name)).not.toContain('Secret task');
  });

  it('lists virtual builtins that cannot be overwritten or deleted', async () => {
    const ownerViews = new SavedViewModel(serverDB, ownerId, workspaceId);
    const visitorViews = new SavedViewModel(serverDB, visitorId, workspaceId);
    const listed = await visitorViews.list();
    expect(listed.map((row) => row.id)).toEqual([
      'builtin:all',
      'builtin:blocked',
      'builtin:in-progress',
      'builtin:projects',
      'builtin:review',
    ]);

    const review = await visitorViews.findById('builtin:review');
    expect(review?.queryAst.filter).toEqual({
      all: [{ field: 'reviewerUserId', op: 'eq', value: { ref: 'currentUser' } }],
    });

    const visitorTask = await new TaskModel(serverDB, visitorId, workspaceId).create({
      instruction: 'Needs a look',
      name: 'Visitor review',
      reviewerUserId: visitorId,
    });
    await new TaskModel(serverDB, ownerId, workspaceId).create({
      instruction: 'Owner review',
      name: 'Owner review',
      reviewerUserId: ownerId,
    });
    const asVisitor = await visitorViews.evaluate(review!);
    expect(asVisitor.tasks?.map((row) => row.id)).toEqual([visitorTask.id]);

    await expect(
      ownerViews.update('builtin:all', { expectedDefinitionVersion: 1, name: 'Hijack' }),
    ).rejects.toBeInstanceOf(SavedViewBuiltinError);
    await expect(ownerViews.delete('builtin:all')).rejects.toBeInstanceOf(SavedViewBuiltinError);
    expect((await visitorViews.findById('builtin:all'))?.name).toBe('All tasks');
  });
});

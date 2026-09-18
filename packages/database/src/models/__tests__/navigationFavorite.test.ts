// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { NavigationFavoriteConflictError, NavigationFavoriteModel } from '../navigationFavorite';
import { SavedViewModel } from '../savedView';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'fav-user';
const otherUserId = 'fav-other';
const workspaceId = 'fav-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Fav WS',
    primaryOwnerId: userId,
    slug: 'fav-ws',
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('NavigationFavoriteModel', () => {
  it('keeps favorites scoped to the caller and workspace', async () => {
    const mine = new NavigationFavoriteModel(serverDB, userId, workspaceId);
    const other = new NavigationFavoriteModel(serverDB, otherUserId, workspaceId);
    await mine.pin({ targetId: 'task_1', targetType: 'task' });
    await other.pin({ targetId: 'task_2', targetType: 'task' });

    expect((await mine.list()).map((row) => row.targetId)).toEqual(['task_1']);
    expect((await other.list()).map((row) => row.targetId)).toEqual(['task_2']);
  });

  it('unpins only the caller row', async () => {
    const mine = new NavigationFavoriteModel(serverDB, userId, workspaceId);
    await mine.pin({ targetId: 'view_1', targetType: 'savedView' });
    expect(await mine.unpin({ targetId: 'view_1', targetType: 'savedView' })).toBe(true);
    expect(await mine.list()).toEqual([]);
  });

  it('resolves saved-view titles the caller can still read and hides the rest', async () => {
    const views = new SavedViewModel(serverDB, userId, workspaceId);
    const readable = await views.create({
      entityType: 'task',
      name: 'Assigned to me',
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } }] },
        schemaVersion: 1,
      },
    });
    const mine = new NavigationFavoriteModel(serverDB, userId, workspaceId);
    await mine.pin({ targetId: readable.id, targetType: 'savedView' });
    await mine.pin({ targetId: 'view_lost', targetType: 'savedView' });
    await mine.pin({ targetId: 'task_secret', targetType: 'task' });

    const listed = await mine.list();
    expect(listed.find((row) => row.targetId === readable.id)?.title).toBe('Assigned to me');
    expect(listed.find((row) => row.targetId === 'view_lost')?.title).toBeNull();
    expect(listed.find((row) => row.targetId === 'task_secret')?.title).toBeNull();
  });

  it('rejects a stale reorder instead of last-write-wins ranks', async () => {
    const mine = new NavigationFavoriteModel(serverDB, userId, workspaceId);
    const first = await mine.pin({ rank: 0, targetId: 'task_a', targetType: 'task' });
    const second = await mine.pin({ rank: 1, targetId: 'task_b', targetType: 'task' });

    const reordered = await mine.reorder({
      items: [
        {
          expectedVersion: first.version,
          rank: 1,
          targetId: 'task_a',
          targetType: 'task',
        },
        {
          expectedVersion: second.version,
          rank: 0,
          targetId: 'task_b',
          targetType: 'task',
        },
      ],
    });
    expect(reordered.map((row) => row.targetId)).toEqual(['task_a', 'task_b']);
    expect((await mine.list()).map((row) => row.targetId)).toEqual(['task_b', 'task_a']);

    await expect(
      mine.reorder({
        items: [
          {
            expectedVersion: first.version,
            rank: 0,
            targetId: 'task_a',
            targetType: 'task',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NavigationFavoriteConflictError);
    expect((await mine.list()).map((row) => row.targetId)).toEqual(['task_b', 'task_a']);
  });
});

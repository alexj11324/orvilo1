// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { NavigationFavoriteModel } from '../navigationFavorite';

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
});

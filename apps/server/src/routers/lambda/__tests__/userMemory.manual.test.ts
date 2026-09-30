// @vitest-environment node
import { LayersEnum } from '@orvilo/types';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { UserMemoryModel } from '@/database/models/userMemory';
import { users } from '@/database/schemas';

import { userMemoryRouter } from '../userMemory';

const connection = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: async () => connection.db }));

let db: Awaited<ReturnType<typeof getTestDB>>;
const caller = (userId = 'alice', extra = {}) =>
  userMemoryRouter.createCaller({ userId, ...extra } as never);
beforeAll(async () => {
  db = await getTestDB();
  connection.db = db;
}, 120000);
beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: 'alice' }, { id: 'bob' }]);
});

describe('manual memory authenticated SQL writes', () => {
  it.each(Object.values(LayersEnum))(
    'persists %s only for its authenticated owner',
    async (layer) => {
      const created = await caller().createManual({ layer, content: '手动记忆 manual memory' });
      expect(created.id).toBeTruthy();
      const alice = new UserMemoryModel(db, 'alice');
      const bob = new UserMemoryModel(db, 'bob');
      expect((await alice.queryMemories({ layer })).items).toHaveLength(1);
      expect((await bob.queryMemories({ layer })).items).toEqual([]);
      const remove = {
        activity: 'deleteActivity',
        context: 'deleteContext',
        experience: 'deleteExperience',
        identity: 'deleteIdentity',
        preference: 'deletePreference',
      } as const;
      await caller('bob')[remove[layer]]({ id: created.id });
      expect((await alice.queryMemories({ layer })).items).toHaveLength(1);
      await caller()[remove[layer]]({ id: created.id });
      expect((await alice.queryMemories({ layer })).items).toEqual([]);
    },
  );
  it('does not let a workspace-scoped purge erase personal memories', async () => {
    await caller().createManual({ layer: LayersEnum.Experience, content: 'personal memory' });
    const scoped = caller('alice', {
      workspaceId: 'ws',
      membership: { userId: 'alice', workspaceId: 'ws', role: 'owner' },
    });
    await expect(scoped.deleteAll()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      (await new UserMemoryModel(db, 'alice').queryMemories({ layer: LayersEnum.Experience }))
        .items,
    ).toHaveLength(1);
  });
  it('rejects unauthenticated, scoped read-only keys, forged owners and authority layers', async () => {
    const input = { layer: LayersEnum.Experience, content: 'manual' };
    await expect(caller('').createManual(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      caller('alice', { apiKeyScopes: ['message:read'] }).createManual(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const bad of [
      { ...input, userId: 'bob' },
      { ...input, layer: 'task' },
      { ...input, content: '中'.repeat(6000) },
      { ...input, content: '  ' },
    ]) {
      await expect(caller().createManual(bad as never)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    }
    expect(
      (await new UserMemoryModel(db, 'alice').queryMemories({ layer: LayersEnum.Experience }))
        .items,
    ).toEqual([]);
  });
});

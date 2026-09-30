// @vitest-environment node
import { createRequire } from 'node:module';

import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { router } from '@/libs/trpc/lambda';

import { experienceMemoryRouter } from '../experienceMemory';

const { PGlite } = createRequire(
  new URL('../../../../../../packages/database/package.json', import.meta.url),
)('@electric-sql/pglite');

const connection = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: async () => connection.db }));

const app = router({ experienceMemory: experienceMemoryRouter });
const caller = (userId: string | undefined = 'alice', extra = {}) =>
  app.createCaller({ userId, ...extra } as never).experienceMemory;
let pg: InstanceType<typeof PGlite>;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE user_experience_memories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL,legacy_id text,content text NOT NULL,revision integer DEFAULT 1 NOT NULL,lifecycle text DEFAULT 'active' NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE user_memories_experiences(id text PRIMARY KEY,user_id text,situation text,reasoning text,action text,key_learning text,updated_at timestamptz DEFAULT now());`);
  connection.db = drizzle(pg);
});
afterEach(async () => {
  await pg.close();
});

describe('experienceMemory actual router and SQL', () => {
  it('rejects anonymous, workspace and restricted-key callers through real middleware', async () => {
    await expect(caller('', {}).list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      caller('alice', {
        workspaceId: 'ws',
        membership: { userId: 'alice', workspaceId: 'ws', role: 'owner' },
      }).list({}),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller('alice', { apiKeyScopes: ['message:read'] }).list({}),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await pg.query('SELECT * FROM user_experience_memories')).rows).toEqual([]);
  });
  it('creates persistent owner-bound rows, denies foreign writes and stale CAS, erases deleted content', async () => {
    const row = await caller().create({ kind: 'experience', content: '构建经验' });
    expect((await caller().list({})).items).toMatchObject([{ id: row.id, content: '构建经验' }]);
    expect((await caller('bob').list({})).items).toEqual([]);
    await expect(
      caller('bob').update({ id: row.id, revision: 1, content: 'foreign' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(caller('bob').delete({ id: row.id, revision: 1 })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const updated = await caller().update({ id: row.id, revision: 1, content: 'updated' });
    expect(updated.revision).toBe(2);
    await expect(
      caller().update({ id: row.id, revision: 1, content: 'stale' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await caller().delete({ id: row.id, revision: 2 });
    expect((await caller().list({})).items).toEqual([]);
    expect((await pg.query('SELECT content,lifecycle FROM user_experience_memories')).rows).toEqual(
      [{ content: '', lifecycle: 'deleted' }],
    );
  });
  it.skipIf(!process.env.PRIME_AGENT_ROOT)(
    'rechecks SQL after real Prime search before returning deleted content',
    async () => {
      const row = await caller().create({
        kind: 'experience',
        content: 'Build failures check Node version',
      });
      const original = pg.query.bind(pg);
      let corpusReads = 0;
      const spy = vi.spyOn(pg, 'query').mockImplementation(async (...args: unknown[]) => {
        const query = args[0];
        if (typeof query === 'string' && query.includes('SELECT * FROM (') && ++corpusReads === 2) {
          await original(
            "UPDATE user_experience_memories SET content='', lifecycle='deleted', revision=revision+1 WHERE id=$1",
            [row.id],
          );
        }
        return original(...args);
      });
      try {
        expect(await caller().search({ query: 'build failures', limit: 5 })).toEqual({
          items: [],
          truncated: false,
        });
        expect(corpusReads).toBe(2);
      } finally {
        spy.mockRestore();
      }
    },
  );
  it('strictly rejects authority kinds, forged owners, unbounded payloads and invalid revisions', async () => {
    for (const input of [
      { kind: 'task', content: 'done' },
      { kind: 'experience', content: 'hi', userId: 'bob' },
      { kind: 'experience', content: '中'.repeat(6000) },
    ]) {
      await expect(caller().create(input as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
    await expect(caller().list({ limit: 501 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller().update({ id: 'not-uuid', revision: 0, content: 'hi' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await caller().list({})).items).toEqual([]);
  });
});

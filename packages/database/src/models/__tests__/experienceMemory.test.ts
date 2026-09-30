// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OrviloDatabase } from '../../type';
import { ExperienceMemoryModel } from '../experienceMemory';

let pg: PGlite;
let alice: ExperienceMemoryModel;
let bob: ExperienceMemoryModel;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE user_experience_memories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL,legacy_id text,content text NOT NULL,revision integer DEFAULT 1 NOT NULL,lifecycle text DEFAULT 'active' NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE user_memories_experiences(id text PRIMARY KEY,user_id text,situation text,reasoning text,action text,key_learning text,updated_at timestamptz DEFAULT now());`);
  const db = drizzle(pg) as unknown as OrviloDatabase;
  alice = new ExperienceMemoryModel(db, 'alice');
  bob = new ExperienceMemoryModel(db, 'bob');
});
afterEach(async () => {
  await pg.close();
});

describe('SQL advisory memory authority', () => {
  it('isolates owners and fences stale mutations without resurrection', async () => {
    const row = await alice.create({ kind: 'experience', content: '构建失败先检查 Node' });
    expect((await bob.list()).items).toEqual([]);
    expect(await bob.update(row.id, 1, 'foreign')).toBeUndefined();
    expect(await alice.update(row.id, 1, 'Updated build lesson')).toMatchObject({ revision: 2 });
    expect(await alice.update(row.id, 1, 'stale')).toBeUndefined();
    expect(await alice.delete(row.id, 1)).toBeUndefined();
    expect(await alice.delete(row.id, 2)).toMatchObject({ content: '', lifecycle: 'deleted' });
    expect(await alice.update(row.id, 3, 'resurrect')).toBeUndefined();
    expect((await alice.list()).items).toEqual([]);
  });
  it('dual reads live legacy edits and deletes, preserving the legacy writer', async () => {
    await pg.query(
      "INSERT INTO user_memories_experiences(id,user_id,key_learning) VALUES ('a','alice','old'),('b','bob','private')",
    );
    expect((await alice.list()).items).toMatchObject([{ id: 'legacy:a', content: 'old' }]);
    await pg.query("UPDATE user_memories_experiences SET key_learning='new' WHERE id='a'");
    expect((await alice.list()).items[0].content).toBe('new');
    await pg.query("DELETE FROM user_memories_experiences WHERE id='a'");
    expect((await alice.list()).items).toEqual([]);
  });
  it('rejects control-plane kinds and oversized content, bounds pages', async () => {
    await expect(alice.create({ kind: 'task', content: 'done' } as never)).rejects.toThrow(
      'Only advisory',
    );
    await expect(
      alice.create({ kind: 'experience', content: '中'.repeat(6000) }),
    ).rejects.toThrow();
    for (const content of ['one', 'two', 'three'])
      await alice.create({ kind: 'experience', content });
    expect(await alice.list(2)).toMatchObject({ hasMore: true, items: expect.any(Array) });
    expect((await alice.list(2, 2)).items).toHaveLength(1);
    await expect(alice.list(501)).rejects.toThrow();
    await alice.deleteAll();
    expect((await alice.list()).items).toEqual([]);
  });
});

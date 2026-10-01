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
  it('suppresses a legacy row only behind its owner tombstone', async () => {
    await pg.query(
      "INSERT INTO user_memories_experiences(id,user_id,key_learning) VALUES ('a','alice','old')",
    );
    // A tombstone keyed to a different owner must not suppress alice's row.
    await pg.query(
      "INSERT INTO user_experience_memories(user_id,legacy_id,content,lifecycle) VALUES ('bob','a','','deleted')",
    );
    expect((await alice.list()).items).toMatchObject([{ id: 'legacy:a', content: 'old' }]);
    expect((await bob.list()).items).toEqual([]);
    // Alice's own tombstone suppresses the legacy read permanently; the
    // tombstone itself is never listed because its legacy_id is set.
    await pg.query(
      "INSERT INTO user_experience_memories(user_id,legacy_id,content,lifecycle) VALUES ('alice','a','','deleted')",
    );
    expect((await alice.list()).items).toEqual([]);
  });
  it('keeps reading the live legacy row while an active shadow exists', async () => {
    await pg.query(
      "INSERT INTO user_memories_experiences(id,user_id,key_learning) VALUES ('a','alice','old')",
    );
    // An active shadow (imported copy) never masks the legacy writer: the
    // legacy row stays authoritative and the shadow is not listed as prime.
    await pg.query(
      "INSERT INTO user_experience_memories(user_id,legacy_id,content) VALUES ('alice','a','imported copy')",
    );
    expect((await alice.list()).items).toMatchObject([{ id: 'legacy:a', content: 'old' }]);
    await pg.query("UPDATE user_memories_experiences SET key_learning='new' WHERE id='a'");
    expect((await alice.list()).items).toMatchObject([{ id: 'legacy:a', content: 'new' }]);
  });
  it('denies foreign deletes and repeated deletes at every revision', async () => {
    const row = await alice.create({ kind: 'experience', content: 'mine' });
    expect(await bob.delete(row.id, 1)).toBeUndefined();
    expect((await alice.list()).items).toMatchObject([{ id: row.id, content: 'mine' }]);
    expect(await alice.delete(row.id, 1)).toMatchObject({ lifecycle: 'deleted', revision: 2 });
    // Re-delete is denied even when the caller presents the tombstone's own revision.
    expect(await alice.delete(row.id, 2)).toBeUndefined();
  });
  it('deleteAll tombstones only the caller prime rows, never the legacy store', async () => {
    const mine = await alice.create({ kind: 'experience', content: 'mine' });
    const foreign = await bob.create({ kind: 'experience', content: 'foreign' });
    await pg.query(
      "INSERT INTO user_memories_experiences(id,user_id,key_learning) VALUES ('a','alice','legacy lives on')",
    );
    await alice.deleteAll();
    expect((await alice.list()).items).toMatchObject([
      { id: 'legacy:a', content: 'legacy lives on' },
    ]);
    expect((await bob.list()).items).toMatchObject([{ id: foreign.id, content: 'foreign' }]);
    const rows = await pg.query(
      `SELECT lifecycle, content FROM user_experience_memories WHERE id='${mine.id}'`,
    );
    expect(rows.rows).toEqual([{ lifecycle: 'deleted', content: '' }]);
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

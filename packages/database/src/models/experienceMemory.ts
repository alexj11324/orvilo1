import { and, eq, sql } from 'drizzle-orm';

import { experienceMemories } from '../schemas/experienceMemory';
import type { OrviloDatabase } from '../type';

export interface ExperienceMemoryItem {
  content: string;
  id: string;
  revision: number;
  source: 'prime' | 'legacy';
  updatedAt: Date;
}

/** SQL is authoritative. Prime receives only these advisory rows, never task state. */
export class ExperienceMemoryModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
  ) {}

  async list(limit = 50, offset = 0) {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 10000
    )
      throw new Error('Invalid memory page');
    // Read the live legacy writer directly: edits/deletes/purge cannot leave stale copies.
    const result = await this.db.execute(sql`
      SELECT * FROM (
        SELECT id::text, content, revision, 'prime' AS source, updated_at AS "updatedAt"
        FROM user_experience_memories WHERE user_id=${this.userId} AND lifecycle='active' AND legacy_id IS NULL
        UNION ALL
        SELECT 'legacy:' || e.id, left(concat_ws(E'\n', e.situation, e.reasoning, e.action, e.key_learning), 4096),
          1, 'legacy', e.updated_at
        FROM user_memories_experiences e WHERE e.user_id=${this.userId}
          AND NOT EXISTS (SELECT 1 FROM user_experience_memories s WHERE s.user_id=${this.userId} AND s.legacy_id=e.id AND s.lifecycle='deleted')
      ) memories ORDER BY "updatedAt" DESC, id LIMIT ${limit + 1} OFFSET ${offset}`);
    const rows = result.rows as unknown as ExperienceMemoryItem[];
    return {
      hasMore: rows.length > limit,
      items: rows.slice(0, limit).map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) })),
    };
  }

  async create(input: { kind: 'experience'; content: string }) {
    if (input.kind !== 'experience') throw new Error('Only advisory experiences can be imported');
    this.validate(input.content);
    const [row] = await this.db
      .insert(experienceMemories)
      .values({ content: input.content, userId: this.userId })
      .returning();
    return row;
  }

  async update(id: string, revision: number, content: string) {
    this.validate(content);
    const [row] = await this.db
      .update(experienceMemories)
      .set({ content, revision: sql`${experienceMemories.revision}+1`, updatedAt: new Date() })
      .where(
        and(
          eq(experienceMemories.id, id),
          eq(experienceMemories.userId, this.userId),
          eq(experienceMemories.revision, revision),
          eq(experienceMemories.lifecycle, 'active'),
        ),
      )
      .returning();
    return row;
  }

  async delete(id: string, revision: number) {
    const [row] = await this.db
      .update(experienceMemories)
      .set({
        content: '',
        lifecycle: 'deleted',
        revision: sql`${experienceMemories.revision}+1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(experienceMemories.id, id),
          eq(experienceMemories.userId, this.userId),
          eq(experienceMemories.revision, revision),
          eq(experienceMemories.lifecycle, 'active'),
        ),
      )
      .returning();
    return row;
  }

  async deleteAll() {
    await this.db
      .update(experienceMemories)
      .set({
        content: '',
        lifecycle: 'deleted',
        revision: sql`${experienceMemories.revision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(experienceMemories.userId, this.userId));
  }

  private validate(content: string) {
    if (
      typeof content !== 'string' ||
      !content.trim() ||
      Buffer.byteLength(content, 'utf8') > 16384
    )
      throw new Error('Invalid experience content');
  }
}

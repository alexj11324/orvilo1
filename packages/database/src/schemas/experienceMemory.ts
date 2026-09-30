import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { users } from './user';

/** Cloud reconstruction. Advisory experiences only; never control-plane authority. */
export const experienceMemories = pgTable(
  'user_experience_memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    legacyId: text('legacy_id'),
    content: text('content').notNull(),
    revision: integer('revision').notNull().default(1),
    lifecycle: text('lifecycle').$type<'active' | 'deleted'>().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('experience_memories_owner_legacy').on(t.userId, t.legacyId),
    index('experience_memories_owner').on(t.userId),
    check('experience_memories_lifecycle', sql`${t.lifecycle} IN ('active','deleted')`),
    check('experience_memories_revision', sql`${t.revision} > 0`),
    check('experience_memories_content_limit', sql`octet_length(${t.content}) <= 16384`),
  ],
);

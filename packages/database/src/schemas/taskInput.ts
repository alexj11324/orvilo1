import { index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { createdAt, timestamptz } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** 'pending' | 'accepted' | 'rejected' | 'consumed' | 'conflict' */
export type TaskInputStatus = 'accepted' | 'conflict' | 'consumed' | 'pending' | 'rejected';

/**
 * Server-authoritative ordered input queue for a managed task — steering
 * instructions, proposals and decisions from multiple collaborators. Ordering
 * is (`task_id`, `sequence`); `baseTaskVersion` records the task domain
 * revision the author wrote against so stale instructions surface as
 * 'conflict' instead of silently overwriting a newer decision. Retried
 * submissions deduplicate on `idempotencyKey`.
 */
export const taskInputs = pgTable(
  'task_inputs',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .notNull()
      .primaryKey(),
    // Tenant anchor: denormalized from the task so cross-task checks stay
    // cheap and a workspace cascade carries every input with it. Service
    // writes keep it consistent with `tasks.workspace_id` in one transaction —
    // nullable like the task column itself (personal tasks have no workspace).
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    authorUserId: text('author_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sequence: integer('sequence').notNull(),
    /** `tasks.domain_revision` observed by the author; null = wrote blind. */
    baseTaskVersion: integer('base_task_version'),
    intentType: text('intent_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').$type<TaskInputStatus>().notNull().default('pending'),
    idempotencyKey: text('idempotency_key').unique(),
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamptz('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_inputs_task_id_sequence_unique').on(t.taskId, t.sequence),
    index('task_inputs_task_id_idx').on(t.taskId),
    index('task_inputs_workspace_id_idx').on(t.workspaceId),
  ],
);

export type NewTaskInput = typeof taskInputs.$inferInsert;
export type TaskInputItem = typeof taskInputs.$inferSelect;

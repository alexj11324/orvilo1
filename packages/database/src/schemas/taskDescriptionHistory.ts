import type { TaskDescriptionCaptureSource, TaskDescriptionSnapshot } from '@orvilo/types';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** Exact snapshots captured by a new description write; no historical reconstruction. */
export const taskDescriptionHistories = pgTable(
  'task_description_histories',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    domainRevision: integer('domain_revision').notNull(),
    instruction: text('instruction').notNull(),
    editorData: jsonb('editor_data').$type<TaskDescriptionSnapshot['editorData']>(),
    /** First observed baseline has no known edit author. */
    captureSource: text('capture_source').$type<TaskDescriptionCaptureSource>().notNull(),
    visibility: text('visibility').$type<'private' | 'public'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_description_histories_task_revision_unique').on(t.taskId, t.domainRevision),
    index('task_description_histories_user_id_idx').on(t.userId),
    index('task_description_histories_author_user_id_idx').on(t.authorUserId),
    index('task_description_histories_workspace_id_idx').on(t.workspaceId),
  ],
);

export type TaskDescriptionHistoryItem = typeof taskDescriptionHistories.$inferSelect;

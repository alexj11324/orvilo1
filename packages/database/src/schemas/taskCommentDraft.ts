import { index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** Private, unsent task comment text. A draft is never a task comment or activity. */
export const taskCommentDrafts = pgTable(
  'task_comment_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    editorData: jsonb('editor_data'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_comment_drafts_task_user_unique').on(t.taskId, t.userId),
    index('task_comment_drafts_user_workspace_idx').on(t.userId, t.workspaceId),
  ],
);

export type TaskCommentDraftItem = typeof taskCommentDrafts.$inferSelect;

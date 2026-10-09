import type { TaskIssueTemplateDefinition } from '@orvilo/types';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** Saved issue definitions, consumed by createFromTemplate without copied runtime state. */
export const taskIssueTemplates = pgTable(
  'task_issue_templates',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    sourceTaskId: text('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    definition: jsonb('definition').$type<TaskIssueTemplateDefinition>().notNull(),
    visibility: text('visibility').$type<'private' | 'public'>().notNull(),
    ...timestamps,
  },
  (t) => [
    index('task_issue_templates_source_task_id_idx').on(t.sourceTaskId),
    index('task_issue_templates_user_id_idx').on(t.userId),
    index('task_issue_templates_workspace_id_idx').on(t.workspaceId),
  ],
);

export type TaskIssueTemplateItem = typeof taskIssueTemplates.$inferSelect;

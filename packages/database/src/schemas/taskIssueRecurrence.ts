import type { TaskIssueRecurrenceCadence, TaskIssueTemplateDefinition } from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** Repeated creation of fresh inactive issues; separate from Agent automation. */
export const taskIssueRecurrences = pgTable(
  'task_issue_recurrences',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    sourceTaskId: text('source_task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    definition: jsonb('definition').$type<TaskIssueTemplateDefinition>().notNull(),
    cadence: text('cadence').$type<TaskIssueRecurrenceCadence>().notNull(),
    interval: integer('interval').notNull().default(1),
    firstDueDate: date('first_due_date').notNull(),
    nextDueDate: date('next_due_date').notNull(),
    timezone: text('timezone').notNull(),
    nextOccurrenceAt: timestamptz('next_occurrence_at').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastOccurrenceAt: timestamptz('last_occurrence_at'),
    lastTaskId: text('last_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    lastError: text('last_error'),
    visibility: text('visibility').$type<'private' | 'public'>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_issue_recurrences_source_task_id_unique').on(t.sourceTaskId),
    index('task_issue_recurrences_user_id_idx').on(t.userId),
    index('task_issue_recurrences_workspace_id_idx').on(t.workspaceId),
    index('task_issue_recurrences_last_task_id_idx').on(t.lastTaskId),
    index('task_issue_recurrences_next_occurrence_idx')
      .on(t.nextOccurrenceAt)
      .where(sql`${t.enabled} = true`),
  ],
);

export type TaskIssueRecurrenceItem = typeof taskIssueRecurrences.$inferSelect;

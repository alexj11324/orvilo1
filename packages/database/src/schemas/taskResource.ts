import type { TaskResourceKind } from '@orvilo/types';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { tasks } from './task';
import { users } from './user';

/** Issue Resources: manually attached external links and pull requests. */
export const taskResources = pgTable(
  'task_resources',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').$type<TaskResourceKind>().notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_resources_task_kind_url_unique').on(t.taskId, t.kind, t.url),
    index('task_resources_added_by_user_id_idx').on(t.addedByUserId),
  ],
);

export type TaskResourceItem = typeof taskResources.$inferSelect;

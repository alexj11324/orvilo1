import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { projects } from './project';
import { users } from './user';

/** External resources on a project overview, not knowledge-base bindings. */
export const projectLinks = pgTable(
  'project_links',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    url: text('url').notNull(),
    ...timestamps,
  },
  (t) => [index('project_links_project_id_idx').on(t.projectId)],
);

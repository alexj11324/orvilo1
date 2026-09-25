import type { ProjectHealth, ProjectUpdateKind } from '@orvilo/types';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';
import { projects } from './project';
import { users } from './user';

/**
 * Project update posts — Linear's project-update entity. A short status note
 * (health + body) authored on a project; the latest update's health is
 * denormalized onto `projects.health` for list surfaces.
 */
export const projectUpdates = pgTable(
  'project_updates',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    /** 'update' carries a health pill and bumps projects.health; 'comment' is a plain feed note. */
    kind: text('kind').$type<ProjectUpdateKind>().default('update').notNull(),
    health: text('health').$type<ProjectHealth>(),
    body: text('body').notNull(),

    ...timestamps,
  },
  (t) => [index('project_updates_project_created_idx').on(t.projectId, t.createdAt)],
);

import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, varchar255 } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * Task labels — a workspace-level (or personal) label registry used to tag
 * tasks, filter WorkQuery results, and render label chips on task rows and the
 * task detail properties rail. Labels are shared with every workspace member;
 * in personal mode (`workspace_id IS NULL`) they belong to a single user.
 *
 * Deliberately separate from `project_labels`: project labels classify
 * projects at the workspace level, while task labels are issue-level taxonomy
 * (Linear's "issue labels"). Keeping the registries disjoint lets each evolve
 * (colors, groups, scoping) without cross-domain coupling.
 */
export const taskLabels = pgTable(
  'task_labels',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    name: varchar255('name').notNull(),
    /** Display color as a CSS hex value, e.g. `#F5A623` */
    color: text('color'),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    ...timestamps,
  },
  (t) => [
    index('task_labels_user_id_idx').on(t.userId),
    index('task_labels_workspace_id_idx').on(t.workspaceId),
    // Names are the only thing distinguishing two labels in a picker, so they
    // are unique per scope. Split in two because the scope key differs:
    // personal rows key on the owner, workspace rows on the workspace (shared
    // across members, so two members cannot race the same name into one
    // workspace).
    uniqueIndex('task_labels_user_id_name_unique')
      .on(t.userId, t.name)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex('task_labels_workspace_id_name_unique')
      .on(t.workspaceId, t.name)
      .where(sql`${t.workspaceId} IS NOT NULL`),
  ],
);

export type NewTaskLabel = typeof taskLabels.$inferInsert;
export type TaskLabelItem = typeof taskLabels.$inferSelect;

/**
 * Assignment rows connecting task labels with tasks. A task can carry any
 * number of labels; the assignment is shared with the whole workspace so every
 * member sees the same chips.
 */
export const taskLabelBindings = pgTable(
  'task_label_bindings',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    labelId: uuid('label_id')
      .references(() => taskLabels.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_label_bindings_task_id_label_id_unique').on(t.taskId, t.labelId),
    index('task_label_bindings_task_id_idx').on(t.taskId),
    index('task_label_bindings_label_id_idx').on(t.labelId),
    index('task_label_bindings_workspace_id_idx').on(t.workspaceId),
  ],
);

export type NewTaskLabelBinding = typeof taskLabelBindings.$inferInsert;
export type TaskLabelBindingItem = typeof taskLabelBindings.$inferSelect;

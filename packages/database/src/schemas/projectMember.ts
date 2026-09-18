import { foreignKey, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, timestamptz, updatedAt } from './_helpers';
import { projects } from './project';
import { users } from './user';
import { workspaceMembers, workspaces } from './workspace';

/** Project-scoped collaboration roles: manager, contributor, commenter, viewer. */
export const PROJECT_MEMBER_ROLES = ['manager', 'contributor', 'commenter', 'viewer'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

/**
 * Explicit project membership — one row per (project, user). A row grants the
 * member a project role ceiling; it never lifts them above their workspace
 * role and never pierces private resources on its own. Activity mirrors
 * `workspace_members`: a member is active while `deletedAt` and `suspendedAt`
 * are both NULL, and `authzVersion` bumps on removal, suspension, resume and
 * role change so cached authorization decisions invalidate by compare.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    /**
     * Surrogate primary key. Business uniqueness lives in the
     * (project_id, user_id) unique index instead of a composite PK, so the
     * uniqueness scope can grow by nullable dimensions later without a PK
     * rebuild (see the ai_providers/ai_models migration 0110 lesson).
     */
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    role: text('role').$type<ProjectMemberRole>().notNull().default('contributor'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamptz('deleted_at'),
    suspendedAt: timestamptz('suspended_at'),
    authzVersion: integer('authz_version').notNull().default(1),
  },
  (t) => [
    // Same one-row-per-membership guarantee as `workspace_members`: the
    // unique index is what `ProjectMemberModel.add`'s upsert restores onto.
    uniqueIndex('project_members_project_id_user_id_unique').on(t.projectId, t.userId),
    // Project membership is only meaningful while the workspace membership
    // exists — the composite FK hard-deletes these rows when the
    // workspace_members row itself is destroyed (soft removals keep the row
    // and `add` restores it, same lifecycle as the parent membership).
    foreignKey({
      columns: [t.workspaceId, t.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
      name: 'project_members_workspace_member_fk',
    }).onDelete('cascade'),
    index('project_members_workspace_id_user_id_idx').on(t.workspaceId, t.userId),
    index('project_members_workspace_id_project_id_idx').on(t.workspaceId, t.projectId),
  ],
);

export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectMemberItem = typeof projectMembers.$inferSelect;

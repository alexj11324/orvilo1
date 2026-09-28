import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { createdAt } from './_helpers';
import { projects } from './project';
import type { ProjectMemberRole } from './projectMember';
import { workspaceInvitations } from './workspace';

/**
 * Project grants an invitation is expected to confer on acceptance — one row
 * per (invitation, project). Accepting the invitation materializes the listed
 * `project_members` rows; nothing here is a live project permission by itself.
 */
export const workspaceInvitationProjects = pgTable(
  'workspace_invitation_projects',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .notNull()
      .primaryKey(),
    invitationId: text('invitation_id')
      .references(() => workspaceInvitations.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').$type<ProjectMemberRole>().notNull().default('contributor'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('workspace_invitation_projects_invitation_id_project_id_unique').on(
      t.invitationId,
      t.projectId,
    ),
  ],
);

export type NewWorkspaceInvitationProject = typeof workspaceInvitationProjects.$inferInsert;
export type WorkspaceInvitationProjectItem = typeof workspaceInvitationProjects.$inferSelect;

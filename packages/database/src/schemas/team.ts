import type {
  TaskCreationSubjectKind,
  TaskCreationSubjectSnapshot,
  TaskWorkflowCategory,
  TeamMembershipRole,
  TeamOrchestrationPolicy,
  TeamStatus,
  TeamVisibility,
} from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { timestamps, timestamptz, varchar255 } from './_helpers';
import { agents } from './agent';
import { projects } from './project';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * A long-lived responsibility domain inside a workspace (linear-workspace-v3).
 * Teams own workflow states, cycles, default execution resources and the
 * issues (tasks) not attached to any project. Projects remain cross-team
 * delivery goals — see `project_teams` for the many-to-many link.
 */
export const teams = pgTable(
  'teams',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('teams'))
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    /** Issue prefix inside the workspace, for example ENG. */
    key: varchar('key', { length: 12 }).notNull(),
    name: varchar255('name').notNull(),
    description: text('description'),
    avatar: text('avatar'),

    /** Managed creation audit — same pattern as tasks. */
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdBySubjectKind: text('created_by_subject_kind')
      .$type<TaskCreationSubjectKind>()
      .notNull()
      .default('user'),
    createdBySubjectId: text('created_by_subject_id'),
    createdBySnapshot: jsonb('created_by_snapshot').$type<TaskCreationSubjectSnapshot>(),

    /**
     * Transactional identifier allocator: `UPDATE teams SET next_issue_seq =
     * next_issue_seq + 1 … RETURNING` hands out `<key>-<n>` — never an
     * unlocked `max(seq)+1` across issue rows.
     */
    nextIssueSeq: integer('next_issue_seq').notNull().default(1),
    /** Exactly one team per workspace is the default issue owner. */
    isDefault: boolean('is_default').notNull().default(false),

    /** Optional coordinating agent for unassigned work in this team's scope. */
    coordinatorAgentId: text('coordinator_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    defaultAgentId: text('default_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),

    status: text('status').$type<TeamStatus>().notNull().default('active'),
    orchestrationPolicy: jsonb('orchestration_policy')
      .$type<TeamOrchestrationPolicy>()
      .notNull()
      .default({}),
    policyRevision: integer('policy_revision').notNull().default(1),

    visibility: text('visibility').$type<TeamVisibility>().notNull().default('public'),
    archivedAt: timestamptz('archived_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('teams_workspace_key_unique').on(t.workspaceId, t.key),
    uniqueIndex('teams_workspace_default_unique')
      .on(t.workspaceId)
      .where(sql`${t.isDefault} = true`),
    index('teams_workspace_id_idx').on(t.workspaceId),
    index('teams_workspace_visibility_idx').on(t.workspaceId, t.visibility),
    index('teams_status_idx').on(t.status),
  ],
);

/** Membership of one user in one team — independent of workspace membership. */
export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').$type<TeamMembershipRole>().notNull().default('member'),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    joinedAt: timestamptz('joined_at').notNull().defaultNow(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('team_members_team_user_unique').on(t.teamId, t.userId),
    index('team_members_user_id_idx').on(t.userId),
    index('team_members_workspace_id_idx').on(t.workspaceId),
  ],
);

/**
 * Local workflow state referenced by `tasks.workflow_state_ref_id`.
 * `remote_state_id` preserves the provider's exact state UUID for round-trip
 * sync while `tasks.workflow_state_id` keeps the same value as a plain-text
 * external projection for backward compatibility — the two columns are
 * intentionally not the same reference until the migration completes.
 */
export const teamWorkflowStates = pgTable(
  'team_workflow_states',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    name: varchar255('name').notNull(),
    category: text('category').$type<TaskWorkflowCategory>().notNull(),
    position: doublePrecision('position'),
    /** Provider state UUID when imported; null for locally-created states. */
    remoteStateId: text('remote_state_id'),
    color: text('color'),
    description: text('description'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('team_workflow_states_remote_unique')
      .on(t.teamId, t.remoteStateId)
      .where(sql`${t.remoteStateId} IS NOT NULL`),
    index('team_workflow_states_team_category_idx').on(t.teamId, t.category),
    index('team_workflow_states_workspace_id_idx').on(t.workspaceId),
  ],
);

/** First-pass cycle record; full cycle planning is a later scope. */
export const teamCycles = pgTable(
  'team_cycles',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    name: varchar255('name'),
    number: integer('number'),
    /** Provider cycle UUID when imported; null for local cycles. */
    remoteCycleId: text('remote_cycle_id'),
    startsAt: timestamptz('starts_at'),
    endsAt: timestamptz('ends_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('team_cycles_remote_unique')
      .on(t.teamId, t.remoteCycleId)
      .where(sql`${t.remoteCycleId} IS NOT NULL`),
    index('team_cycles_team_id_idx').on(t.teamId),
    index('team_cycles_workspace_id_idx').on(t.workspaceId),
  ],
);

/**
 * Many-to-many participation of teams in a project. The project row stays
 * single — importing a project touched by several Linear teams links all of
 * them here instead of duplicating the project.
 */
export const projectTeams = pgTable(
  'project_teams',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: text('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_teams_project_team_unique').on(t.projectId, t.teamId),
    index('project_teams_team_id_idx').on(t.teamId),
    index('project_teams_workspace_id_idx').on(t.workspaceId),
  ],
);

// Entity row DTOs (`TeamItem`, `NewTeam`, `TeamMemberItem`,
// `TeamWorkflowStateItem`, `TeamCycleItem`) live in `@orvilo/types` — matching
// the tasks/projects convention, the schema does not re-export those names.
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type NewTeamWorkflowState = typeof teamWorkflowStates.$inferInsert;
export type NewTeamCycle = typeof teamCycles.$inferInsert;
export type ProjectTeamItem = typeof projectTeams.$inferSelect;
export type NewProjectTeam = typeof projectTeams.$inferInsert;

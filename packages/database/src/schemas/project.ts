import type {
  ProjectCompletionDecision,
  ProjectDatePrecision,
  ProjectHealth,
  ProjectMigrationClass,
  ProjectOrchestrationPolicy,
  ProjectPriority,
  ProjectStatus,
  ProjectVisibility,
  ProjectWorkingDirectoryPermission,
  TaskCreationSubjectKind,
  TaskCreationSubjectSnapshot,
} from '@orvilo/types';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { idGenerator, randomSlug } from '../utils/idGenerator';
import { softDeleteColumns, timestamps, timestamptz } from './_helpers';
import { agents } from './agent';
import { chatGroups } from './chatGroup';
import { devices } from './device';
import { knowledgeBases } from './file';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * A long-lived, goal-oriented scope of work. A project organizes reusable agents
 * and knowledge around tasks and deliverables, but does not own those reusable
 * resources or expand their permissions.
 */
export const projects = pgTable(
  'projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('projects'))
      .notNull(),
    slug: varchar('slug', { length: 100 }).$defaultFn(() => randomSlug(3)),
    /** Human-readable task prefix within the project scope, for example ORVILO. */
    identifier: varchar('identifier', { length: 6 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    summary: text('summary'),
    avatar: text('avatar'),
    leadUserId: text('lead_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Planned dates, independent of execution lifecycle startedAt/completedAt. */
    startDate: date('start_date'),
    startDatePrecision: text('start_date_precision').$type<ProjectDatePrecision>(),
    targetDate: date('target_date'),
    targetDatePrecision: text('target_date_precision').$type<ProjectDatePrecision>(),

    /**
     * Dedicated agent that coordinates all conversations and work inside this
     * project. Nullable (linear-workspace-v3): with `user_id` surviving owner
     * removal via SET NULL, a restricted coordinator FK would block deleting
     * the owner account outright — the coordinator clears instead.
     */
    coordinatorAgentId: text('coordinator_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),

    status: text('status').$type<ProjectStatus>().notNull().default('backlog'),
    /** Linear-style project priority: 0 (no priority) through 4 (low). */
    priority: integer('priority').$type<ProjectPriority>().notNull().default(0),

    /**
     * Owning user. Nullable (linear-workspace-v3): when the owner account is
     * removed, workspace-owned projects survive with `user_id = NULL` instead
     * of being cascaded away; personal rows (workspace_id IS NULL) become
     * ownerless and invisible — equivalent to deletion for every reader.
     */
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Managed creation audit — same pattern as tasks/teams. */
    createdBySubjectKind: text('created_by_subject_kind')
      .$type<TaskCreationSubjectKind>()
      .notNull()
      .default('user'),
    createdBySubjectId: text('created_by_subject_id'),
    createdBySnapshot: jsonb('created_by_snapshot').$type<TaskCreationSubjectSnapshot>(),
    /**
     * Migration-review marker for pre-existing projects — records how a legacy
     * project is treated while delivery semantics roll out. Not user-facing.
     */
    migrationClass: text('migration_class')
      .$type<ProjectMigrationClass>()
      .notNull()
      .default('undetermined'),
    visibility: text('visibility').$type<ProjectVisibility>().notNull().default('public'),
    /** Latest project-update health, denormalized for list surfaces. */
    health: text('health').$type<ProjectHealth>(),
    orchestrationPolicy: jsonb('orchestration_policy')
      .$type<ProjectOrchestrationPolicy>()
      .notNull()
      .default({
        autoDispatch: false,
        requireHumanReview: true,
        replanMode: 'disabled',
      }),
    orchestrationPolicyRevision: integer('orchestration_policy_revision').notNull().default(1),

    /**
     * The accepted completion review that currently closes this project. Soft
     * reference because project_completion_reviews points back to projects.
     * Written when status becomes completed and retained if that project is
     * subsequently archived; cleared when completed work is reopened.
     */
    completedReviewId: uuid('completed_review_id'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    archivedAt: timestamptz('archived_at'),

    /** Recycle bin — see `schemas/trash.ts`. */
    ...softDeleteColumns(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('projects_slug_user_id_unique')
      .on(t.slug, t.userId)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex('projects_slug_workspace_id_unique')
      .on(t.workspaceId, t.slug)
      .where(sql`${t.workspaceId} IS NOT NULL`),
    uniqueIndex('projects_identifier_user_id_unique')
      .on(t.identifier, t.userId)
      .where(sql`${t.workspaceId} IS NULL`),
    uniqueIndex('projects_identifier_workspace_id_unique')
      .on(t.workspaceId, t.identifier)
      .where(sql`${t.workspaceId} IS NOT NULL`),
    index('projects_user_id_idx').on(t.userId),
    index('projects_workspace_id_idx').on(t.workspaceId),
    index('projects_workspace_visibility_idx').on(t.workspaceId, t.visibility, t.userId),
    index('projects_status_updated_at_idx').on(t.status, t.updatedAt),
    index('projects_priority_idx').on(t.priority),
    uniqueIndex('projects_coordinator_agent_id_unique').on(t.coordinatorAgentId),
    check(
      'projects_completed_requires_human_review',
      sql`${t.status} <> 'completed' OR (${t.completedReviewId} IS NOT NULL AND ${t.completedAt} IS NOT NULL)`,
    ),
    check('projects_priority_valid', sql`${t.priority} BETWEEN 0 AND 4`),
  ],
);

/** Workspace-level project label taxonomy. Labels are independent from agent labels. */
export const projectLabels = pgTable(
  'project_labels',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_labels_workspace_id_name_unique').on(t.workspaceId, t.name),
    index('project_labels_workspace_id_idx').on(t.workspaceId),
  ],
);

export type NewProjectLabel = typeof projectLabels.$inferInsert;
export type ProjectLabelItem = typeof projectLabels.$inferSelect;

/** Many-to-many binding between a project and a workspace project label. */
export const projectLabelBindings = pgTable(
  'project_label_bindings',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    labelId: uuid('label_id')
      .references(() => projectLabels.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_label_bindings_project_id_label_id_unique').on(t.projectId, t.labelId),
    index('project_label_bindings_project_id_idx').on(t.projectId),
    index('project_label_bindings_label_id_idx').on(t.labelId),
  ],
);

export type NewProjectLabelBinding = typeof projectLabelBindings.$inferInsert;
export type ProjectLabelBindingItem = typeof projectLabelBindings.$inferSelect;

/** Directional end-to-start dependency: predecessor must finish before successor starts. */
export const projectDependencies = pgTable(
  'project_dependencies',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    predecessorId: text('predecessor_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    successorId: text('successor_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_dependencies_predecessor_successor_unique').on(
      t.predecessorId,
      t.successorId,
    ),
    index('project_dependencies_predecessor_id_idx').on(t.predecessorId),
    index('project_dependencies_successor_id_idx').on(t.successorId),
    check('project_dependencies_no_self_reference', sql`${t.predecessorId} <> ${t.successorId}`),
  ],
);

export type NewProjectDependency = typeof projectDependencies.$inferInsert;
export type ProjectDependencyItem = typeof projectDependencies.$inferSelect;

/** A project delivery milestone, independent from agent goals. */
export const projectMilestones = pgTable(
  'project_milestones',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    date: date('date'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('project_milestones_project_id_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_milestones_project_id_date_idx').on(t.projectId, t.date),
  ],
);

export type NewProjectMilestone = typeof projectMilestones.$inferInsert;
export type ProjectMilestoneItem = typeof projectMilestones.$inferSelect;

/**
 * A device-backed directory made available to a project as an execution context.
 * The directory remains device-owned; removing this binding never deletes local files.
 */
export const projectWorkingDirectories = pgTable(
  'project_working_directories',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    /** Nullable so a removed device leaves a repairable binding with its last-known path. */
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    addedByUserId: text('added_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Absolute path on the bound device, for example /Users/name/Code/orvilo. */
    path: text('path').notNull(),
    /** User-facing label; defaults to the final path segment at the application boundary. */
    name: varchar('name', { length: 255 }).notNull(),
    permission: text('permission')
      .$type<ProjectWorkingDirectoryPermission>()
      .notNull()
      .default('readWrite'),
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_working_directories_project_device_path_unique').on(
      t.projectId,
      t.deviceId,
      t.path,
    ),
    uniqueIndex('project_working_directories_project_primary_unique')
      .on(t.projectId)
      .where(sql`${t.isPrimary} = true`),
    index('project_working_directories_project_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_working_directories_device_id_idx').on(t.deviceId),
    index('project_working_directories_workspace_id_idx').on(t.workspaceId),
    check('project_working_directories_path_not_empty', sql`length(btrim(${t.path})) > 0`),
    check('project_working_directories_name_not_empty', sql`length(btrim(${t.name})) > 0`),
  ],
);

export type NewProjectWorkingDirectory = typeof projectWorkingDirectories.$inferInsert;
export type ProjectWorkingDirectoryItem = typeof projectWorkingDirectories.$inferSelect;

/** Direct agent participation in a project; chat-group members are not duplicated here. */
export const projectAgents = pgTable(
  'project_agents',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: text('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    /** Project-specific role, for example lead, researcher, implementer, or reviewer. */
    role: text('role'),
    /** Project-specific responsibility beyond the short role label. */
    responsibility: text('responsibility'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_agents_project_id_agent_id_unique').on(t.projectId, t.agentId),
    index('project_agents_project_id_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_agents_agent_id_idx').on(t.agentId),
    index('project_agents_workspace_id_idx').on(t.workspaceId),
  ],
);

/** A reusable multi-agent chat group participating in a project as one collaboration unit. */
export const projectChatGroups = pgTable(
  'project_chat_groups',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    chatGroupId: text('chat_group_id')
      .references(() => chatGroups.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    /** Responsibility of the whole group in this project; group-member roles remain group-owned. */
    role: text('role'),
    responsibility: text('responsibility'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_chat_groups_project_id_chat_group_id_unique').on(
      t.projectId,
      t.chatGroupId,
    ),
    index('project_chat_groups_project_id_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_chat_groups_chat_group_id_idx').on(t.chatGroupId),
    index('project_chat_groups_workspace_id_idx').on(t.workspaceId),
  ],
);

/** Reusable knowledge made available to a project without changing resource ownership. */
export const projectKnowledgeBases = pgTable(
  'project_knowledge_bases',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    knowledgeBaseId: text('knowledge_base_id')
      .references(() => knowledgeBases.id, { onDelete: 'cascade' })
      .notNull(),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_knowledge_bases_project_id_knowledge_base_id_unique').on(
      t.projectId,
      t.knowledgeBaseId,
    ),
    index('project_knowledge_bases_project_id_sort_order_idx').on(t.projectId, t.sortOrder),
    index('project_knowledge_bases_knowledge_base_id_idx').on(t.knowledgeBaseId),
    index('project_knowledge_bases_workspace_id_idx').on(t.workspaceId),
  ],
);

/**
 * Immutable human decisions on whether a project satisfies its success criteria.
 * Agents may request a review, but only a user can author one of these rows.
 */
export const projectCompletionReviews = pgTable(
  'project_completion_reviews',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    /** Human author at decision time; set null if that user account is later deleted. */
    reviewerUserId: text('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    round: integer('round').notNull(),
    decision: text('decision').$type<ProjectCompletionDecision>().notNull(),
    comment: text('comment'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('project_completion_reviews_project_id_round_unique').on(t.projectId, t.round),
    index('project_completion_reviews_project_id_created_at_idx').on(t.projectId, t.createdAt),
    index('project_completion_reviews_reviewer_user_id_idx').on(t.reviewerUserId),
    index('project_completion_reviews_workspace_id_idx').on(t.workspaceId),
    check('project_completion_reviews_round_positive', sql`${t.round} > 0`),
  ],
);

import type { TaskWorkflowCategory } from '@orvilo/types';
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { linearInstallations } from './linearSync';
import { projects } from './project';
import { tasks } from './task';
import { workspaces } from './workspace';

export type LinearImportStatus = 'queued' | 'running' | 'failed' | 'completed';
export type LinearImportMapping = { linearStateId: string; workflowCategory: TaskWorkflowCategory };

/** Frozen one-time import scope, independent of live Linear synchronization. */
export const linearImportJobs = pgTable(
  'linear_import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: text('team_id').notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    requestedByUserId: text('requested_by_user_id').notNull(),
    stateMappings: jsonb('state_mappings').$type<LinearImportMapping[]>().notNull(),
    status: text('status').$type<LinearImportStatus>().notNull().default('queued'),
    cursor: text('cursor'),
    pagesProcessed: integer('pages_processed').notNull().default(0),
    issuesImported: integer('issues_imported').notNull().default(0),
    issuesSkipped: integer('issues_skipped').notNull().default(0),
    issuesFailed: integer('issues_failed').notNull().default(0),
    lastError: text('last_error'),
    leaseOwner: uuid('lease_owner'),
    lockedUntil: timestamptz('locked_until'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('linear_import_jobs_scope_unique').on(
      t.workspaceId,
      t.installationId,
      t.teamId,
      t.projectId,
    ),
    index('linear_import_jobs_workspace_status_idx').on(t.workspaceId, t.status),
  ],
);

/** A source issue may produce at most one one-time imported task per workspace. */
export const linearImportReceipts = pgTable(
  'linear_import_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    installationId: uuid('installation_id')
      .references(() => linearInstallations.id, { onDelete: 'cascade' })
      .notNull(),
    jobId: uuid('job_id')
      .references(() => linearImportJobs.id, { onDelete: 'cascade' })
      .notNull(),
    linearIssueId: text('linear_issue_id').notNull(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    result: text('result').$type<'imported' | 'skipped_sync'>().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('linear_import_receipts_source_unique').on(
      t.workspaceId,
      t.installationId,
      t.linearIssueId,
    ),
    index('linear_import_receipts_job_idx').on(t.jobId),
  ],
);

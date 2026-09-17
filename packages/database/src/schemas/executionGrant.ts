import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { createdAt, timestamptz, updatedAt } from './_helpers';
import { agents } from './agent';
import { projects } from './project';
import { tasks, taskTopics } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/** 'active' | 'exhausted' | 'revoked' | 'expired' */
export type ExecutionGrantStatus = 'active' | 'exhausted' | 'expired' | 'revoked';

/**
 * Who delegated the run: a human member ('user') or an admin-approved project
 * automation policy ('automation'). Never the workspace owner by default.
 */
export type ExecutionGrantDelegationSubjectType = 'automation' | 'user';

/** Authorization versions captured at grant time for revalidation on use. */
export type ExecutionGrantAuthzVersions = Record<string, number>;

/**
 * A bounded delegation record for one authorized execution scope — what an
 * agent may do, on whose behalf, with which credential bindings and budget,
 * until when. The grant is the authority for a managed run; `task_topics`
 * points back at it via `execution_grant_id` and `execution_epoch` fences
 * stale holders.
 */
export const executionGrants = pgTable(
  'execution_grants',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .notNull()
      .primaryKey(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    taskTopicId: uuid('task_topic_id').references(() => taskTopics.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    /** Member who initiated the run; survives as audit even if they leave. */
    initiatedBy: text('initiated_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    delegationSubjectType: text('delegation_subject_type')
      .$type<ExecutionGrantDelegationSubjectType>()
      .notNull()
      .default('user'),
    delegationSubjectId: text('delegation_subject_id'),
    /** Whitelisted action names this grant may perform (e.g. task.write). */
    allowedActions: jsonb('allowed_actions').$type<string[]>().notNull().default([]),
    credentialBindingIds: jsonb('credential_binding_ids').$type<string[]>().notNull().default([]),
    executionBindingId: text('execution_binding_id'),
    budgetReservation: jsonb('budget_reservation'),
    /** authz versions of the delegation inputs at issuance (membership, project, policy). */
    authzVersions: jsonb('authz_versions').$type<ExecutionGrantAuthzVersions>(),
    status: text('status').$type<ExecutionGrantStatus>().notNull().default('active'),
    expiresAt: timestamptz('expires_at'),
    revokedAt: timestamptz('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('execution_grants_workspace_id_idx').on(t.workspaceId),
    index('execution_grants_task_id_idx').on(t.taskId),
    index('execution_grants_task_topic_id_idx').on(t.taskTopicId),
    index('execution_grants_agent_id_idx').on(t.agentId),
  ],
);

export type NewExecutionGrant = typeof executionGrants.$inferInsert;
export type ExecutionGrantItem = typeof executionGrants.$inferSelect;

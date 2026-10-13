import {
  orchestrationWorkflowStatuses,
  orchestrationWorkflowSubjectTypes,
} from '@orvilo/const/orchestrationWorkflow';
import type { OrchestrationWorkflowConfig } from '@orvilo/types';
import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { idGenerator } from '../utils/idGenerator';
import { amountNumeric, createdAt, softDeleteColumns, timestamptz, updatedAt } from './_helpers';
import { agents } from './agent';
import { projects } from './project';
import { users } from './user';
import { workspaces } from './workspace';

// ── OrchestrationWorkflows ────────────────────────────────────────────────
//
// A orchestration workflow is an independent target entity. It owns its definition (title /
// requirement), budget, and lifecycle state — and is NOT tied to a task: the
// execution carrier is an optional polymorphic link (`subject_type` /
// `subject_id`), so the same table can back a task-driven orchestration workflow (the current
// `startOrchestrationWorkflow` flow), a orchestration workflow declared directly in a conversation, or a standalone
// orchestration workflow declaration. Everything execution-specific (rounds, cost, duration,
// acceptance checks) stays on the carrier and its existing tables.
export const orchestrationWorkflows = pgTable(
  'orchestration_workflows',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('orchestrationWorkflows'))
      .notNull(),

    // ── Ownership (denormalized for list queries / access control) ──
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),

    // ── OrchestrationWorkflow definition (independent of the carrier) ──
    title: text('title').notNull(),
    /** "What counts as done" — the acceptance requirement source. */
    requirement: text('requirement'),

    /** Runtime policy for automatic recovery and bounded Work execution. */
    config: jsonb('config').$type<OrchestrationWorkflowConfig>(),

    // ── Budget (outer loop) ──
    /** Round budget; null = uncapped. */
    maxRounds: integer('max_rounds'),
    /** Total USD budget across all rounds; null = uncapped. */
    maxTotalCost: amountNumeric('max_total_cost'),

    // ── Lifecycle (own state machine, decoupled from task.status) ──
    status: text('status', { enum: orchestrationWorkflowStatuses }).default('planning').notNull(),

    // ── Optional polymorphic execution carrier ──
    // 'task' | 'topic' | 'standalone' | null — no FK on purpose, the subject
    // may live in different tables (tasks / topics / none). Existence and
    // ownership are validated by the service that binds the carrier.
    subjectType: text('subject_type', { enum: orchestrationWorkflowSubjectTypes }),
    subjectId: text('subject_id'),

    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    /** Recycle bin — see `schemas/trash.ts`. */
    ...softDeleteColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('orchestration_workflows_user_id_idx').on(t.userId),
    index('orchestration_workflows_workspace_id_idx').on(t.workspaceId),
    index('orchestration_workflows_agent_id_idx').on(t.agentId),
    index('orchestration_workflows_project_id_idx').on(t.projectId),
    index('orchestration_workflows_status_idx').on(t.status),
    index('orchestration_workflows_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

export type NewOrchestrationWorkflow = typeof orchestrationWorkflows.$inferInsert;
export type OrchestrationWorkflowItem = typeof orchestrationWorkflows.$inferSelect;

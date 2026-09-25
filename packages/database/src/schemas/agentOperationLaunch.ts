import type { AgentOperationLaunchStatus } from '@orvilo/types';
import { isNull, sql } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { timestamps, timestamptz } from './_helpers';
import { workspaces } from './workspace';

/**
 * Durable launch registration for retained judgments (SB10).
 *
 * Claimed atomically BEFORE any external side effect (execAgent) so a
 * concurrent or retried call keyed on the same stable business request
 * identity — (principal, workspace, purpose, intentKey, attempt) — reads or
 * takes over the recorded launch instead of spawning a second writer. The
 * `operationId` binds once the dispatch ACK lands; `cancel_requested` keeps a
 * durable cancel intent so a reconcile pass (same-intent caller, or a late
 * `execAgent` resolution) still interrupts whatever landed after the original
 * caller's process went away.
 */
export const agentOperationLaunches = pgTable(
  'agent_operation_launches',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createNanoId(16)())
      .notNull(),

    /** Principal that claimed the launch — audit only, not an FK. */
    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    /** Consumer identifier, e.g. 'verify.judge', 'goal.criteriaDraft'. */
    purpose: text('purpose').notNull(),
    /**
     * Stable business request identity: caller-supplied, or a content hash
     * derived from (messages, schema, task, attempt) — never a random id, so
     * retries of the same logical request dedupe naturally.
     */
    intentKey: text('intent_key').notNull(),
    /** 1-based attempt index; a new attempt is a fresh launch, never a takeover. */
    attempt: integer('attempt').notNull().default(0),

    /** Bound after `execAgent` resolves; NULL while the ACK is still lost. */
    operationId: text('operation_id'),
    status: text('status').$type<AgentOperationLaunchStatus>().notNull().default('claimed'),
    cancelReason: text('cancel_reason'),
    /** Launch deadline — reconcile treats a stale `claimed` row as orphaned. */
    deadlineAt: timestamptz('deadline_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('agent_operation_launches_intent_workspace_unique')
      .on(t.userId, t.workspaceId, t.purpose, t.intentKey, t.attempt)
      .where(sql`${t.workspaceId} IS NOT NULL`),
    uniqueIndex('agent_operation_launches_intent_personal_unique')
      .on(t.userId, t.purpose, t.intentKey, t.attempt)
      .where(isNull(t.workspaceId)),
    index('agent_operation_launches_status_deadline_idx').on(t.status, t.deadlineAt),
    index('agent_operation_launches_operation_id_idx').on(t.operationId),
  ],
);

export type NewAgentOperationLaunch = typeof agentOperationLaunches.$inferInsert;
export type AgentOperationLaunchItem = typeof agentOperationLaunches.$inferSelect;

import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { createdAt, timestamptz } from './_helpers';
import { users } from './user';
import { workspaces } from './workspace';

/** 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed' */
export type ActionApprovalStatus = 'approved' | 'consumed' | 'expired' | 'pending' | 'rejected';

/**
 * A single-use approval for a risky action. The requester writes the action
 * summary, the target and the version/SHA the approval was issued against;
 * execution re-checks `paramsHash`, `baseVersion` and `baseSha` at consume
 * time so an approval dies with the state it was granted on. 'consumed' is
 * terminal — an approval never executes twice.
 */
export const actionApprovals = pgTable(
  'action_approvals',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(16)())
      .notNull()
      .primaryKey(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    actionType: text('action_type').notNull(),
    /** Human/machine-readable digest of what is being approved (params, diff summary). */
    actionSummary: jsonb('action_summary').notNull().default({}),
    targetType: text('target_type'),
    targetId: text('target_id'),
    /** Hash of the exact parameters approved; drift at consume time invalidates. */
    paramsHash: text('params_hash'),
    /** Resource version the approval was issued against. */
    baseVersion: integer('base_version'),
    /** Git SHA the approval was issued against, for code-targeting actions. */
    baseSha: text('base_sha'),
    requestedBy: text('requested_by').references(() => users.id, { onDelete: 'set null' }),
    approverUserId: text('approver_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').$type<ActionApprovalStatus>().notNull().default('pending'),
    expiresAt: timestamptz('expires_at'),
    decidedAt: timestamptz('decided_at'),
    consumedAt: timestamptz('consumed_at'),
    /**
     * The stable dispatch/intent the grant was spent on. A retry of the same
     * dispatch re-adopts this consumed row instead of re-consuming — the grant
     * is spent once per logical run, not once per attempt.
     */
    consumedByDispatchId: text('consumed_by_dispatch_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('action_approvals_workspace_id_idx').on(t.workspaceId),
    index('action_approvals_workspace_status_idx').on(t.workspaceId, t.status),
    index('action_approvals_target_idx').on(t.targetType, t.targetId),
  ],
);

export type ActionApprovalItem = typeof actionApprovals.$inferSelect;
export type NewActionApproval = typeof actionApprovals.$inferInsert;

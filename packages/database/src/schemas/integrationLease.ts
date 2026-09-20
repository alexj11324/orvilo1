import type { IntegrationLeasePhase } from '@orvilo/types';
import { bigint, boolean, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { workspaces } from './workspace';

/** Reconciliation context persisted when a mutation-phase outcome is lost. */
export interface RepoRefLeaseOutcomeContext {
  expectedBaseSha?: string;
  expectedHeadSha?: string;
  fenceSeq?: number;
  phase?: IntegrationLeasePhase;
  recordedAt?: string;
}

/**
 * Durable repo/ref lease serializing the merge+publish critical section of
 * CAID integration (R02). One row per (scope, target, ref): claim is a short
 * transaction (insert-or-steal), remote I/O runs without a held connection,
 * and every side effect re-fences on `owner_token` + `deadline`.
 *
 * `outcome_unknown` survives the holder: when a mutation-phase error or a
 * dead connection leaves the remote write's result ambiguous, the flag stays
 * on the row so the next claimant reconciles the remote state before
 * re-issuing writes instead of blindly re-publishing.
 */
export const integrationLeases = pgTable(
  'integration_leases',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    /** Owning scope (workspace) — null for legacy device paths without one. */
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    /**
     * Serialized lease key: the *physical* coordinate `${target}#${ref}` —
     * workspace scope is deliberately excluded so two workspaces that can
     * reach the same repo/ref contend on one lock (authorization stays
     * workspace-scoped on the caller side).
     */
    key: text('key').notNull(),
    /** Canonical repo identity — remote coordinate or device path. */
    target: text('target').notNull(),
    /** Base ref being integrated onto. */
    ref: text('ref').notNull(),

    /** Fencing token — a fresh UUID per acquisition. */
    ownerToken: text('owner_token').notNull(),
    /** Monotone fence, incremented by every successful claim/steal. */
    fenceSeq: bigint('fence_seq', { mode: 'number' }).notNull().default(0),
    ownerTaskId: text('owner_task_id'),
    ownerTopicId: text('owner_topic_id'),
    /** Write class currently in flight — see `IntegrationLeasePhase`. */
    phase: text('phase').$type<IntegrationLeasePhase>().notNull().default('claimed'),
    /** Ref head/base the holder verified at claim time. */
    expectedBaseSha: text('expected_base_sha'),
    expectedHeadSha: text('expected_head_sha'),
    /**
     * A mutation-phase failure or lost response left the remote outcome
     * ambiguous — the next claimant must reconcile before re-writing.
     */
    outcomeUnknown: boolean('outcome_unknown').notNull().default(false),
    /** Snapshot of the prior phase context for post-crash reconciliation. */
    context: jsonb('context').$type<RepoRefLeaseOutcomeContext>(),
    /** Heartbeat deadline — expiry makes the row stealable, never auto-clean. */
    deadline: timestamptz('deadline').notNull(),
    releasedAt: timestamptz('released_at'),

    ...timestamps,
  },
  (t) => [uniqueIndex('integration_leases_key_unique').on(t.key)],
);

export type IntegrationLeaseItem = typeof integrationLeases.$inferSelect;

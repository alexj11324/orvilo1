import type {
  PullRequestReviewOperation,
  PullRequestReviewReceiptData,
  PullRequestReviewReceiptStatus,
} from '@orvilo/types';
import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * Durable claim + receipt for one review write operation. Keyed by the
 * client-supplied `operationId` inside the full caller/binding scope —
 * (user, workspace, connection, repo, pull request, operation) — so a retried
 * operation replays its recorded outcome instead of applying the remote write
 * twice. The row is inserted as a `prepared` claim BEFORE any remote call: the
 * unique index makes exactly one caller the dispatcher while concurrent losers
 * read the pending or terminal state. `dispatched` marks the remote mutation
 * in flight (with `remoteId` once known); `applied` and `outcome_unknown` are
 * terminal.
 */
export const pullRequestReviewReceipts = pgTable(
  'pull_request_review_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    /**
     * The GitHub account binding the write ran under — the viewer's numeric
     * `databaseId` (e.g. `12345`), falling back to the login only when the id
     * is absent from the response.
     */
    connectionId: text('connection_id').notNull(),
    /** Provider repository identity — `owner/name`. */
    repoId: text('repo_id').notNull(),
    /** Canonical review id — `gh:<host>:<owner>:<repo>:<number>`. */
    pullRequestId: text('pull_request_id').notNull(),
    /** Which write produced the receipt — submitReview / replyToThread / addFileComment. */
    operation: text('operation').$type<PullRequestReviewOperation>().notNull(),
    /** Client idempotency key; stable across retries of the same intended write. */
    operationId: text('operation_id').notNull(),
    /** Hash of the operation payload; a mismatch on replay is OPERATION_CONFLICT. */
    digest: text('digest').notNull(),
    status: text('status').$type<PullRequestReviewReceiptStatus>().notNull(),
    /**
     * Remote object the operation acts on, persisted once known so a replay or
     * crash-restart reconciles against the exact write — never a body search.
     * The pull-request-review node id for submits; the created comment/thread
     * node id for comment writes (known only once the mutation lands).
     */
    remoteId: text('remote_id'),
    /**
     * The pull-request head the write landed on. Only ever a SHA returned by a
     * GitHub response — null when GitHub did not report one.
     */
    appliedHeadSha: text('applied_head_sha'),
    /** Operation result payload; null while the outcome is unknown. */
    data: jsonb('data').$type<PullRequestReviewReceiptData>(),
    /** True when the outcome was recovered by reconciliation, not the mutation response. */
    reconciled: boolean('reconciled').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('pull_request_review_receipts_identity_unique').on(
      t.userId,
      t.workspaceId,
      t.connectionId,
      t.repoId,
      t.pullRequestId,
      t.operation,
      t.operationId,
    ),
    index('pull_request_review_receipts_scope_idx').on(
      t.userId,
      t.workspaceId,
      t.repoId,
      t.pullRequestId,
      t.operation,
      t.operationId,
    ),
  ],
);

export type PullRequestReviewReceiptItem = typeof pullRequestReviewReceipts.$inferSelect;
export type NewPullRequestReviewReceipt = typeof pullRequestReviewReceipts.$inferInsert;

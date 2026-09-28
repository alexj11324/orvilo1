import type { PullRequestReviewOperation, PullRequestReviewReceiptStatus } from '@orvilo/types';
import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  NewPullRequestReviewReceipt,
  PullRequestReviewReceiptItem,
} from '../schemas/pullRequestReview';
import { pullRequestReviewReceipts } from '../schemas/pullRequestReview';
import type { OrviloDatabase, Transaction } from '../type';

/** Claim/receipt lookup scope — the operation identity minus the connection binding. */
export interface PullRequestReviewReceiptScope {
  operation: PullRequestReviewOperation;
  operationId: string;
  pullRequestId: string;
  repoId: string;
  userId: string;
  workspaceId: string;
}

export type PullRequestReviewReceiptIdentity = PullRequestReviewReceiptScope & {
  connectionId: string;
};

const NON_TERMINAL_STATUSES = ['prepared', 'dispatched'] as const;

const RECEIPT_IDENTITY = [
  pullRequestReviewReceipts.userId,
  pullRequestReviewReceipts.workspaceId,
  pullRequestReviewReceipts.connectionId,
  pullRequestReviewReceipts.repoId,
  pullRequestReviewReceipts.pullRequestId,
  pullRequestReviewReceipts.operation,
  pullRequestReviewReceipts.operationId,
];

const scopeWhere = (scope: PullRequestReviewReceiptScope) =>
  and(
    eq(pullRequestReviewReceipts.userId, scope.userId),
    eq(pullRequestReviewReceipts.workspaceId, scope.workspaceId),
    eq(pullRequestReviewReceipts.repoId, scope.repoId),
    eq(pullRequestReviewReceipts.pullRequestId, scope.pullRequestId),
    eq(pullRequestReviewReceipts.operation, scope.operation),
    eq(pullRequestReviewReceipts.operationId, scope.operationId),
  );

const identityWhere = (identity: PullRequestReviewReceiptIdentity) =>
  and(scopeWhere(identity), eq(pullRequestReviewReceipts.connectionId, identity.connectionId));

/**
 * Server-side claim store for review write operations. The caller inserts a
 * `prepared` row — atomic on the full operation identity — BEFORE any remote
 * call, so exactly one caller ever dispatches a given operationId; concurrent
 * losers and post-crash retries read the row and reconcile instead of
 * re-applying the write. No row lock is held across the network call.
 */
export class PullRequestReviewReceiptModel {
  constructor(private readonly db: OrviloDatabase) {}

  /** Claim/receipt rows recorded under one operation scope, newest first. */
  findByOperationScope = async (
    scope: PullRequestReviewReceiptScope,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem[]> =>
    executor
      .select()
      .from(pullRequestReviewReceipts)
      .where(scopeWhere(scope))
      .orderBy(desc(pullRequestReviewReceipts.createdAt));

  /** Single row under the full 7-column identity — the claim's exact owner. */
  findByIdentity = async (
    identity: PullRequestReviewReceiptIdentity,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem | null> => {
    const [row] = await executor
      .select()
      .from(pullRequestReviewReceipts)
      .where(identityWhere(identity))
      .limit(1);
    return row ?? null;
  };

  /**
   * Atomically claim an operation: insert the `prepared` row, or return null
   * when the identity is already taken — the loser must read the stored row
   * rather than dispatch a second remote write.
   */
  claim = async (
    input: NewPullRequestReviewReceipt,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem | null> => {
    const [inserted] = await executor
      .insert(pullRequestReviewReceipts)
      .values({ ...input, status: 'prepared' })
      .onConflictDoNothing({ target: RECEIPT_IDENTITY })
      .returning();
    return inserted ?? null;
  };

  /**
   * Mark a won claim as dispatched to GitHub. `remoteId` records the exact
   * remote object the mutation acts on so a retry reconciles against it.
   * Refuses to touch a row that already reached a terminal status.
   */
  markDispatched = async (
    identity: PullRequestReviewReceiptIdentity,
    remoteId: string | null = null,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem | null> => {
    const patch: Partial<NewPullRequestReviewReceipt> = { status: 'dispatched' };
    if (remoteId != null) patch.remoteId = remoteId;
    const [row] = await executor
      .update(pullRequestReviewReceipts)
      .set(patch)
      .where(
        and(
          identityWhere(identity),
          inArray(pullRequestReviewReceipts.status, [...NON_TERMINAL_STATUSES]),
        ),
      )
      .returning();
    return row ?? null;
  };

  /**
   * Resolve a claim to a terminal outcome — `applied` or `outcome_unknown`.
   * Only rows still in `from` (default: non-terminal) are updated, so a slower
   * caller finishing later can never overwrite a resolved operation. Pass a
   * wider `from` when a reconcile repairs an `outcome_unknown` row to
   * `applied`.
   */
  resolve = async (
    identity: PullRequestReviewReceiptIdentity,
    patch: Pick<
      NewPullRequestReviewReceipt,
      'appliedHeadSha' | 'data' | 'digest' | 'reconciled' | 'remoteId' | 'status'
    >,
    options?: {
      executor?: Transaction | OrviloDatabase;
      from?: readonly PullRequestReviewReceiptStatus[];
    },
  ): Promise<PullRequestReviewReceiptItem | null> => {
    const executor = options?.executor ?? this.db;
    const [row] = await executor
      .update(pullRequestReviewReceipts)
      .set({ updatedAt: new Date(), ...patch })
      .where(
        and(
          identityWhere(identity),
          inArray(pullRequestReviewReceipts.status, [...(options?.from ?? NON_TERMINAL_STATUSES)]),
        ),
      )
      .returning();
    return row ?? null;
  };
}

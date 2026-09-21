import type { PullRequestReviewOperation } from '@orvilo/types';
import { and, desc, eq } from 'drizzle-orm';

import type {
  NewPullRequestReviewReceipt,
  PullRequestReviewReceiptItem,
} from '../schemas/pullRequestReview';
import { pullRequestReviewReceipts } from '../schemas/pullRequestReview';
import type { OrviloDatabase, Transaction } from '../type';

/** Receipt lookup scope — the receipt identity minus the connection binding. */
export interface PullRequestReviewReceiptScope {
  operation: PullRequestReviewOperation;
  operationId: string;
  pullRequestId: string;
  repoId: string;
  userId: string;
  workspaceId: string;
}

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

const identityWhere = (identity: PullRequestReviewReceiptScope & { connectionId: string }) =>
  and(scopeWhere(identity), eq(pullRequestReviewReceipts.connectionId, identity.connectionId));

/**
 * Server-side store for review write receipts. A retried `operationId` replays
 * the recorded outcome instead of re-applying the remote write; recording is a
 * single insert-on-conflict so concurrent callers converge on the first row.
 */
export class PullRequestReviewReceiptModel {
  constructor(private readonly db: OrviloDatabase) {}

  /** Receipt rows recorded under one operation scope, newest first. */
  findByOperationScope = async (
    scope: PullRequestReviewReceiptScope,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem[]> =>
    executor
      .select()
      .from(pullRequestReviewReceipts)
      .where(scopeWhere(scope))
      .orderBy(desc(pullRequestReviewReceipts.createdAt));

  /**
   * Persist a terminal receipt. Atomic upsert on the full receipt identity —
   * when a concurrent caller recorded the same operation first, returns that
   * existing row instead of overwriting it.
   */
  record = async (
    input: NewPullRequestReviewReceipt,
    executor: Transaction | OrviloDatabase = this.db,
  ): Promise<PullRequestReviewReceiptItem> => {
    const [inserted] = await executor
      .insert(pullRequestReviewReceipts)
      .values(input)
      .onConflictDoNothing({ target: RECEIPT_IDENTITY })
      .returning();
    if (inserted) return inserted;

    const [existing] = await executor
      .select()
      .from(pullRequestReviewReceipts)
      .where(
        identityWhere({
          connectionId: input.connectionId,
          operation: input.operation,
          operationId: input.operationId,
          pullRequestId: input.pullRequestId,
          repoId: input.repoId,
          userId: input.userId,
          workspaceId: input.workspaceId,
        }),
      )
      .limit(1);
    if (!existing) {
      throw new Error('pull_request_review_receipts: insert conflicted but no identity row found');
    }
    return existing;
  };
}

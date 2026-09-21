// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { NewPullRequestReviewReceipt } from '../../schemas';
import { pullRequestReviewReceipts, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { PullRequestReviewReceiptModel } from '../pullRequestReviewReceipt';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'pr-receipt-user';
const otherUserId = 'pr-receipt-other-user';
const workspaceId = 'pr-receipt-ws';
const otherWorkspaceId = 'pr-receipt-other-ws';

const model = new PullRequestReviewReceiptModel(serverDB);

const receiptInput = (
  over: Partial<NewPullRequestReviewReceipt> = {},
): NewPullRequestReviewReceipt => ({
  connectionId: 'gh-1001',
  digest: 'digest-1',
  operation: 'submitReview',
  operationId: 'op-1',
  pullRequestId: 'gh:github.com:acme:app:42',
  repoId: 'acme/app',
  status: 'applied',
  appliedHeadSha: 'sha-landed',
  data: {
    databaseId: 9,
    id: 'PRR_1',
    state: 'APPROVED',
    url: 'https://github.com/acme/app/pull/42#pullrequestreview-9',
  },
  reconciled: false,
  userId,
  workspaceId,
  ...over,
});

const scope = {
  operation: 'submitReview' as const,
  operationId: 'op-1',
  pullRequestId: 'gh:github.com:acme:app:42',
  repoId: 'acme/app',
  userId,
  workspaceId,
};

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values([
    { id: workspaceId, name: 'WS', primaryOwnerId: userId, slug: 'pr-receipt-ws' },
    { id: otherWorkspaceId, name: 'Other WS', primaryOwnerId: otherUserId, slug: 'pr-receipt-2' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('PullRequestReviewReceiptModel', () => {
  describe('record', () => {
    it('persists a receipt under the full operation identity', async () => {
      const row = await model.record(receiptInput());

      expect(row).toMatchObject({
        appliedHeadSha: 'sha-landed',
        connectionId: 'gh-1001',
        operationId: 'op-1',
        reconciled: false,
        status: 'applied',
      });

      const [stored] = await serverDB
        .select()
        .from(pullRequestReviewReceipts)
        .where(eq(pullRequestReviewReceipts.id, row.id));
      expect(stored.digest).toBe('digest-1');
      expect(stored.data).toMatchObject({ state: 'APPROVED' });
    });

    it('is atomic — a concurrent duplicate insert returns the first row unchanged', async () => {
      const first = await model.record(receiptInput());

      const second = await model.record(
        receiptInput({ appliedHeadSha: 'sha-other', data: { id: 'PRR_2' }, digest: 'digest-2' }),
      );

      expect(second.id).toBe(first.id);
      expect(second.appliedHeadSha).toBe('sha-landed');
      expect(second.digest).toBe('digest-1');
    });

    it('persists outcome_unknown with no fabricated head sha', async () => {
      const row = await model.record(
        receiptInput({
          appliedHeadSha: null,
          data: null,
          operationId: 'op-2',
          status: 'outcome_unknown',
        }),
      );

      expect(row.status).toBe('outcome_unknown');
      expect(row.appliedHeadSha).toBeNull();
      expect(row.data).toBeNull();
    });

    it('treats a different connectionId under the same operation scope as a distinct identity', async () => {
      const first = await model.record(receiptInput());
      const rebound = await model.record(receiptInput({ connectionId: 'gh-2002' }));

      expect(rebound.id).not.toBe(first.id);
      expect(rebound.connectionId).toBe('gh-2002');
    });
  });

  describe('findByOperationScope', () => {
    it('returns rows for the scope regardless of connection binding', async () => {
      await model.record(receiptInput());
      await model.record(receiptInput({ connectionId: 'gh-2002' }));

      const rows = await model.findByOperationScope(scope);
      expect(rows.map((row) => row.connectionId).sort()).toEqual(['gh-1001', 'gh-2002']);
    });

    it('does not leak receipts across users or workspaces', async () => {
      await model.record(receiptInput());
      await model.record(
        receiptInput({
          connectionId: 'gh-3003',
          userId: otherUserId,
          workspaceId: otherWorkspaceId,
        }),
      );

      expect(
        await model.findByOperationScope({ ...scope, userId: otherUserId, workspaceId }),
      ).toHaveLength(0);
      expect(
        await model.findByOperationScope({ ...scope, workspaceId: otherWorkspaceId }),
      ).toHaveLength(0);
      expect(await model.findByOperationScope(scope)).toHaveLength(1);
    });
  });
});

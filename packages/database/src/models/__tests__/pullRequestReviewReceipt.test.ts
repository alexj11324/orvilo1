// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { NewPullRequestReviewReceipt } from '../../schemas';
import { pullRequestReviewReceipts, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import type { PullRequestReviewReceiptIdentity } from '../pullRequestReviewReceipt';
import { PullRequestReviewReceiptModel } from '../pullRequestReviewReceipt';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'pr-receipt-user';
const otherUserId = 'pr-receipt-other-user';
const workspaceId = 'pr-receipt-ws';
const otherWorkspaceId = 'pr-receipt-other-ws';

const model = new PullRequestReviewReceiptModel(serverDB);

const claimInput = (
  over: Partial<NewPullRequestReviewReceipt> = {},
): NewPullRequestReviewReceipt => ({
  connectionId: 'gh-1001',
  digest: 'digest-1',
  operation: 'submitReview',
  operationId: 'op-1',
  pullRequestId: 'gh:github.com:acme:app:42',
  repoId: 'acme/app',
  status: 'prepared',
  appliedHeadSha: null,
  data: null,
  reconciled: false,
  remoteId: null,
  userId,
  workspaceId,
  ...over,
});

const identity: PullRequestReviewReceiptIdentity = {
  connectionId: 'gh-1001',
  operation: 'submitReview',
  operationId: 'op-1',
  pullRequestId: 'gh:github.com:acme:app:42',
  repoId: 'acme/app',
  userId,
  workspaceId,
};

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
  describe('claim', () => {
    it('inserts a prepared claim under the full operation identity', async () => {
      const row = await model.claim(claimInput());

      expect(row).toMatchObject({
        connectionId: 'gh-1001',
        operationId: 'op-1',
        remoteId: null,
        status: 'prepared',
      });
    });

    it('is atomic — exactly one of two racing claims wins', async () => {
      const [first, second] = await Promise.all([
        model.claim(claimInput()),
        model.claim(claimInput({ digest: 'digest-2' })),
      ]);

      expect([first, second].filter(Boolean)).toHaveLength(1);
      const rows = await serverDB
        .select()
        .from(pullRequestReviewReceipts)
        .where(eq(pullRequestReviewReceipts.operationId, 'op-1'));
      expect(rows).toHaveLength(1);
    });

    it('treats a different connectionId under the same operation scope as a distinct claim', async () => {
      const first = await model.claim(claimInput());
      const rebound = await model.claim(claimInput({ connectionId: 'gh-2002' }));

      expect(rebound?.id).not.toBe(first?.id);
      expect(rebound?.connectionId).toBe('gh-2002');
    });
  });

  describe('markDispatched', () => {
    it('moves a prepared claim to dispatched and persists the remote id', async () => {
      await model.claim(claimInput());

      const row = await model.markDispatched(identity, 'PRR_1');
      expect(row).toMatchObject({ remoteId: 'PRR_1', status: 'dispatched' });
    });

    it('refuses to touch a terminal row', async () => {
      await model.claim(claimInput());
      await model.resolve(identity, {
        appliedHeadSha: 'sha-1',
        data: null,
        digest: 'digest-1',
        reconciled: false,
        remoteId: 'PRR_1',
        status: 'applied',
      });

      expect(await model.markDispatched(identity, 'PRR_other')).toBeNull();
      const row = await model.findByIdentity(identity);
      expect(row).toMatchObject({ remoteId: 'PRR_1', status: 'applied' });
    });
  });

  describe('resolve', () => {
    it('persists an applied receipt with no fabricated head sha', async () => {
      await model.claim(claimInput());
      const row = await model.resolve(identity, {
        appliedHeadSha: 'sha-landed',
        data: { id: 'PRR_1', state: 'APPROVED' },
        digest: 'digest-1',
        reconciled: false,
        remoteId: 'PRR_1',
        status: 'applied',
      });

      expect(row?.status).toBe('applied');
      expect(row?.remoteId).toBe('PRR_1');
    });

    it('persists outcome_unknown and is terminal — a slower resolve cannot overwrite it', async () => {
      await model.claim(claimInput());
      await model.resolve(identity, {
        appliedHeadSha: null,
        data: null,
        digest: 'digest-1',
        reconciled: false,
        remoteId: 'PRR_1',
        status: 'outcome_unknown',
      });

      const late = await model.resolve(identity, {
        appliedHeadSha: 'sha-late',
        data: { id: 'PRR_1' },
        digest: 'digest-1',
        reconciled: false,
        remoteId: 'PRR_1',
        status: 'applied',
      });
      expect(late).toBeNull();
      expect((await model.findByIdentity(identity))?.status).toBe('outcome_unknown');
    });

    it('a reconcile may upgrade outcome_unknown to applied via a wider from set', async () => {
      await model.claim(claimInput());
      await model.resolve(identity, {
        appliedHeadSha: null,
        data: null,
        digest: 'digest-1',
        reconciled: false,
        remoteId: 'PRR_1',
        status: 'outcome_unknown',
      });

      const repaired = await model.resolve(
        identity,
        {
          appliedHeadSha: 'sha-landed',
          data: { id: 'PRR_1', state: 'APPROVED' },
          digest: 'digest-1',
          reconciled: true,
          remoteId: 'PRR_1',
          status: 'applied',
        },
        { from: ['prepared', 'dispatched', 'outcome_unknown'] },
      );
      expect(repaired).toMatchObject({ reconciled: true, status: 'applied' });
    });
  });

  describe('findByOperationScope', () => {
    it('returns rows for the scope regardless of connection binding', async () => {
      await model.claim(claimInput());
      await model.claim(claimInput({ connectionId: 'gh-2002' }));

      const rows = await model.findByOperationScope(scope);
      expect(rows.map((row) => row.connectionId).sort()).toEqual(['gh-1001', 'gh-2002']);
    });

    it('does not leak receipts across users or workspaces', async () => {
      await model.claim(claimInput());
      await model.claim(
        claimInput({
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

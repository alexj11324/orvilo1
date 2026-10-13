// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users } from '../../schemas';
import { AgentOperationModel } from '../agentOperation';
import { VerifyCheckResultModel } from '../verifyCheckResult';
import { VerifyRunModel } from '../verifyRun';

const db = await getTestDB();
const userId = 'verification-retry-owner';
const runs = new VerifyRunModel(db, userId);
const results = new VerifyCheckResultModel(db, userId);

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: userId });
});

describe('verification-only retries', () => {
  it('claims one retry, preserves delivery/evidence/verdicts, and fences stale child writes', async () => {
    const operations = new AgentOperationModel(db, userId);
    for (const operationId of ['retry-builder', 'retry-old-verifier', 'retry-new-verifier'])
      await operations.recordStart({ operationId });
    const run = await runs.ensureForOperation('retry-builder');
    await runs.setPlan(
      run.id,
      ['passed', 'blocked'].map((id, index) => ({
        id,
        index,
        onFail: 'manual',
        required: true,
        title: id,
        verifierConfig: {},
        verifierType: 'agent',
      })),
    );
    await results.createMany([
      {
        verifyRunId: run.id,
        checkItemId: 'passed',
        checkItemIndex: 0,
        verifierType: 'agent',
        status: 'passed',
        verdict: 'passed',
      },
      {
        verifyRunId: run.id,
        checkItemId: 'blocked',
        checkItemIndex: 1,
        verifierType: 'agent',
        status: 'errored',
        verifierOperationId: 'retry-old-verifier',
      },
    ]);
    await runs.setMetadata(run.id, { taskDrivenAt: 'prior-drive', originalEvidence: 'retained' });
    await runs.recordVerificationContext(run.id, 'original delivery');
    await runs.recordVerificationContext(run.id, 'replacement must not overwrite');
    await runs.updateStatus(run.id, 'errored');
    const claims = await Promise.all([
      runs.prepareErroredRetry(run.id),
      runs.prepareErroredRetry(run.id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await results.claimPendingCheck(run.id, 'passed')).toBeNull();
    const attemptId = (await results.claimPendingCheck(run.id, 'blocked'))!;
    expect(await results.claimPendingCheck(run.id, 'blocked')).toBeNull();
    expect(
      await results.bindVerifierOperation(run.id, 'blocked', 'retry-old-verifier', 'stale-attempt'),
    ).toBe(false);
    await results.failUnboundVerifierCheck(run.id, 'blocked', 'stale-attempt', {
      status: 'errored',
    });
    await results.updateClaimedCheck(run.id, 'blocked', 'stale-attempt', {
      status: 'failed',
      verdict: 'failed',
    });
    expect((await results.listByRun(run.id))[1].status).toBe('running');
    expect(
      await results.bindVerifierOperation(run.id, 'blocked', 'retry-new-verifier', attemptId),
    ).toBe(true);
    expect(
      await results.bindVerifierOperation(run.id, 'blocked', 'retry-old-verifier', 'stale-attempt'),
    ).toBe(false);
    expect(
      await results.completeVerifierCheck(run.id, 'blocked', 'retry-old-verifier', {
        status: 'failed',
        verdict: 'failed',
      }),
    ).toBe(false);
    expect(
      await results.completeVerifierCheck(run.id, 'blocked', 'retry-new-verifier', {
        status: 'passed',
        verdict: 'passed',
      }),
    ).toBe(true);
    expect((await results.listByRun(run.id)).map(({ status }) => status)).toEqual([
      'passed',
      'passed',
    ]);
    expect((await runs.findByOperation('retry-builder'))?.metadata).toEqual({
      originalEvidence: 'retained',
      verificationDeliverable: 'original delivery',
    });
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { AcceptanceService } from '../acceptanceService';
import { VerifyExecutorService } from '../executor';
import {
  resumeIssueVerification,
  runVerifyAfterEvidenceSubmission,
  runVerifyOnCompletion,
} from '../lifecycle';
import { instantiateVerifyPlanOnStart } from '../planInstantiation';
import { driveTaskFromVerify, finalizeVerifyRun } from '../settle';
import { sweepStuckVerifyRuns } from '../sweep';
import { settleVerifierCheckFromTerminal } from '../verifierTerminal';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/server/services/aiAgent/deviceQueue', () => ({
  cancelQueuedDeviceOperation: vi.fn(),
  finishQueuedDeviceOperation: vi.fn(),
  readDeviceQueue: vi.fn(),
}));
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: class {} }));
const touched = vi.fn();
const db = new Proxy(
  {},
  {
    get() {
      touched();
      throw new Error('Legacy ledger must remain untouched');
    },
  },
) as OrviloDatabase;
const completion = {
  operationId: 'operation',
  deliverable: 'historical output',
  goal: 'legacy goal',
};

beforeEach(() => vi.clearAllMocks());

describe('retired Verify producers', () => {
  it.each([
    ['completion', () => runVerifyOnCompletion(db, 'user', completion)],
    ['evidence callback', () => runVerifyAfterEvidenceSubmission(db, 'user', completion)],
    ['reviewer assignment', () => resumeIssueVerification(db, 'user', { taskId: 'task' })],
    [
      'plan instantiation',
      () => instantiateVerifyPlanOnStart(db, 'user', { taskId: 'task', operationId: 'operation' }),
    ],
    ['task settlement', () => driveTaskFromVerify(db, 'user', 'operation')],
    ['run finalizer', () => finalizeVerifyRun(db, 'user', 'operation', {})],
    [
      'verifier terminal callback',
      () =>
        settleVerifierCheckFromTerminal(db, 'user', {
          checkItemId: 'item',
          parentOperationId: 'operation',
          verifierOperationId: 'reviewer',
        }),
    ],
  ] as const)('%s does not read or write the old ledger', async (_name, invoke) => {
    await expect(invoke()).resolves.toBeUndefined();
    expect(touched).not.toHaveBeenCalled();
  });
  it('does not recover or repair old runs from a sweep', async () => {
    await expect(sweepStuckVerifyRuns(db)).resolves.toEqual({
      abandoned: [],
      settled: [],
      skipped: 0,
    });
    expect(touched).not.toHaveBeenCalled();
  });
  it('rejects a stale standalone Acceptance writer before touching rows', async () => {
    await expect(
      new AcceptanceService(db, 'user').ensureForSubject('task', 'task'),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(touched).not.toHaveBeenCalled();
  });
  it('rejects a stale executor before creating a run or result', async () => {
    await expect(new VerifyExecutorService(db, 'user').execute(completion)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(touched).not.toHaveBeenCalled();
  });
});

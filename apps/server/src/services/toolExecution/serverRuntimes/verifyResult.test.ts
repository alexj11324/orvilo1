// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyResultRuntime } from './verifyResult';

const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  task: vi.fn(),
  run: vi.fn(),
  results: vi.fn(),
  update: vi.fn(),
  recompute: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn(function () {
    return { findById: mocks.operation };
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { findById: mocks.task };
  }),
}));
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return { findByOperation: mocks.run };
  }),
}));
vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return { listByRun: mocks.results, recordReviewerVerdict: mocks.update };
  }),
}));
vi.mock('@/server/services/verify', () => ({
  finalizeVerifyRun: mocks.finalize,
  VerifyStatusService: vi.fn(function () {
    return { recompute: mocks.recompute };
  }),
}));
const runtime = () =>
  verifyResultRuntime.factory({ operationId: 'review-op', userId: 'u', serverDB: {} } as never) as {
    submitVerifyResult: (input: unknown) => Promise<{ success: boolean; error?: string }>;
  };
const verdict = {
  checkItemId: 'c1',
  verdict: 'passed',
  evidence: 'check output',
  reasoning: 'matches criterion',
};
describe('Reviewer result writeback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.operation.mockImplementation(async (id) =>
      id === 'review-op'
        ? { parentOperationId: 'builder-op', agentId: 'reviewer' }
        : { taskId: 'task' },
    );
    mocks.task.mockResolvedValue({ reviewerAgentId: 'reviewer' });
    mocks.run.mockResolvedValue({ id: 'run' });
    mocks.update.mockResolvedValue(true);
    mocks.results.mockResolvedValue([{ checkItemId: 'c1', verifierOperationId: 'review-op' }]);
  });
  it('records the selected reviewer verdict and suggestion', async () => {
    expect(
      await runtime().submitVerifyResult({ ...verdict, suggestion: 'Fix the check' }),
    ).toMatchObject({ success: true });
    expect(mocks.update).toHaveBeenCalledWith(
      'run',
      'c1',
      'review-op',
      expect.objectContaining({ verdict: 'passed', suggestion: 'Fix the check' }),
    );
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });
  it.each([{ userDecision: 'accepted' }, { verdict: 'passed' }])(
    'preserves already recorded decisions',
    async (settled) => {
      mocks.results.mockResolvedValue([{ checkItemId: 'c1', ...settled }]);
      expect(await runtime().submitVerifyResult(verdict)).toMatchObject({
        success: false,
        error: 'ALREADY_RECORDED',
      });
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it('rejects the previous reviewer after the Issue binding changes', async () => {
    mocks.task.mockResolvedValue({ reviewerAgentId: 'new-reviewer' });
    expect(await runtime().submitVerifyResult(verdict)).toMatchObject({
      success: false,
      error: 'REVIEWER_CHANGED',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a check assigned to a different fresh operation', async () => {
    mocks.results.mockResolvedValue([
      { checkItemId: 'c1', verifierOperationId: 'another-review-op' },
    ]);
    expect(await runtime().submitVerifyResult(verdict)).toMatchObject({
      success: false,
      error: 'CHECK_MISMATCH',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('rejects a decision that wins the race after admission', async () => {
    mocks.update.mockResolvedValue(false);
    expect(await runtime().submitVerifyResult(verdict)).toMatchObject({
      success: false,
      error: 'ALREADY_RECORDED',
    });
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordHeterogeneousDeliverableEvidence } from '../evidenceSubmission';

const { createMany, execAgent, findByOperation, upsertByCheckItem } = vi.hoisted(() => ({
  createMany: vi.fn(),
  execAgent: vi.fn(),
  findByOperation: vi.fn(),
  upsertByCheckItem: vi.fn(),
}));

vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { execAgent };
  }),
}));
vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return { upsertByCheckItem };
  }),
}));
vi.mock('@/database/models/verifyEvidence', () => ({
  VerifyEvidenceModel: vi.fn(function () {
    return { createMany };
  }),
}));
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return { findByOperation };
  }),
}));

describe('recordHeterogeneousDeliverableEvidence', () => {
  beforeEach(() => {
    execAgent.mockReset().mockResolvedValue({ operationId: 'evidence-op' });
    findByOperation.mockReset().mockResolvedValue({ id: 'run-1' });
    upsertByCheckItem.mockReset().mockResolvedValue({ id: 'result-1' });
    createMany.mockReset().mockResolvedValue(undefined);
  });

  it('records the heterogeneous builder deliverable as inline evidence for every criterion', async () => {
    await recordHeterogeneousDeliverableEvidence({
      db: {} as any,
      deliverable: 'artifact path and sha-256',
      operation: { id: 'work-op' } as any,
      plan: [
        {
          id: 'criterion-1',
          index: 0,
          onFail: 'manual',
          required: true,
          title: 'Artifact exists',
          verifierConfig: {},
          verifierType: 'llm',
        },
      ],
      userId: 'user-1',
    });

    expect(upsertByCheckItem).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'work-op', verifyRunId: 'run-1' }),
    );
    expect(createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        capturedBy: 'agent',
        content: 'artifact path and sha-256',
        type: 'text',
      }),
    ]);
  });
});

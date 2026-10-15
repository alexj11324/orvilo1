// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VerifyExecutorService } from '../executor';

const mocks = vi.hoisted(() => ({
  aiGenerateObject: vi.fn(),
  documentFindByIds: vi.fn(),
  evidenceListByRun: vi.fn(),
  fileAccessUrl: vi.fn(),
  fileFindById: vi.fn(),
  modelProperty: vi.fn(),
  resultCreateMany: vi.fn(),
  resultListByRun: vi.fn(),
  resultUpdateByCheckItem: vi.fn(),
  runEnsureForOperation: vi.fn(),
  statusMarkVerifying: vi.fn(),
  statusRecompute: vi.fn(),
}));

vi.mock('@orvilo/model-runtime', () => ({
  getModelPropertyWithFallback: mocks.modelProperty,
}));
vi.mock('@/database/models/document', () => ({
  DocumentModel: vi.fn(function () {
    return { findById: vi.fn(), findByIds: mocks.documentFindByIds };
  }),
}));
vi.mock('@/database/models/file', () => ({
  FileModel: vi.fn(function () {
    return { findById: mocks.fileFindById };
  }),
}));
vi.mock('@/database/models/verifyEvidence', () => ({
  VerifyEvidenceModel: vi.fn(function () {
    return { listByRun: mocks.evidenceListByRun };
  }),
}));
vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn(function () {
    return {
      createMany: mocks.resultCreateMany,
      listByRun: mocks.resultListByRun,
      updateByCheckItem: mocks.resultUpdateByCheckItem,
    };
  }),
}));
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return {
      ensureForOperation: mocks.runEnsureForOperation,
      findByOperation: mocks.runEnsureForOperation,
    };
  }),
}));
vi.mock('@/server/services/aiGeneration', () => ({
  AiGenerationService: vi.fn(function () {
    return { generateObject: mocks.aiGenerateObject };
  }),
}));
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return { getFileAccessUrl: mocks.fileAccessUrl };
  }),
}));
vi.mock('../statusService', () => ({
  VerifyStatusService: vi.fn(function () {
    return {
      markVerifying: mocks.statusMarkVerifying,
      recompute: mocks.statusRecompute,
    };
  }),
}));

describe('VerifyExecutorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evidenceListByRun.mockResolvedValue([]);
    mocks.documentFindByIds.mockResolvedValue([]);
    mocks.modelProperty.mockResolvedValue({ vision: false });
    mocks.fileAccessUrl.mockResolvedValue('https://files.example/image.png');
    mocks.fileFindById.mockResolvedValue({
      fileType: 'image/png',
      id: 'file-1',
      url: 'evidence/image.png',
    });
    mocks.resultCreateMany.mockResolvedValue(undefined);
    mocks.resultListByRun
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ checkItemId: 'word-count', status: 'pending' }]);
    mocks.resultUpdateByCheckItem.mockResolvedValue(undefined);
    mocks.statusMarkVerifying.mockResolvedValue(undefined);
    mocks.statusRecompute.mockResolvedValue('verifying');
  });

  it('runs a program criterion through the verifier-agent fallback', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      plan: [
        {
          id: 'word-count',
          index: 0,
          required: true,
          title: '字数达标',
          verifierType: 'program',
        },
      ],
      planConfirmedAt: new Date(),
    });
    const runVerifierAgent = vi.fn().mockResolvedValue({
      verifierOperationId: 'verifier-op-1',
      initiatingMessage: 'Inspect the output',
      waitingReason: 'Reviewer is queued',
    });

    await new VerifyExecutorService({} as never, 'user-1').execute({
      deliverable: 'story',
      goal: 'write a story',
      reviewerAgentId: 'reviewer-1',
      operationId: 'builder-op-1',
      runVerifierAgent,
    });

    expect(runVerifierAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        checkItem: expect.objectContaining({ id: 'word-count', verifierType: 'program' }),
        operationId: 'builder-op-1',
      }),
    );
    expect(mocks.resultUpdateByCheckItem).toHaveBeenCalledWith(
      'run-1',
      'word-count',
      expect.objectContaining({
        status: 'running',
        verifierOperationId: 'verifier-op-1',
        metadata: { initiatingMessage: 'Inspect the output', waitingReason: 'Reviewer is queued' },
      }),
    );
  });

  it('lets the verifier agent resolve deliverable-scoped documents without uploaded run evidence', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      plan: [
        {
          id: 'document-check',
          index: 0,
          onFail: 'auto_repair',
          required: true,
          title: 'Document',
          verifierConfig: {
            requiredEvidence: [{ modality: 'text', scope: 'deliverable', type: 'markdown' }],
          },
          verifierType: 'llm',
        },
      ],
      planConfirmedAt: new Date(),
    });
    const runVerifierAgent = vi.fn().mockResolvedValue({ verifierOperationId: 'verifier-op-doc' });

    await new VerifyExecutorService({} as never, 'user-1').execute({
      deliverable: 'document link',
      goal: 'verify document',
      reviewerAgentId: 'reviewer-1',
      operationId: 'builder-op-doc',
      runVerifierAgent,
    });

    expect(runVerifierAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        checkItem: expect.objectContaining({ id: 'document-check' }),
      }),
    );
    expect(mocks.resultUpdateByCheckItem).not.toHaveBeenCalledWith(
      'run-1',
      'document-check',
      expect.objectContaining({ verdict: 'uncertain' }),
    );
  });

  it('routes file-backed text evidence to an agent that can inspect the stored artifact', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      plan: [
        {
          id: 'large-transcript',
          index: 0,
          onFail: 'auto_repair',
          required: true,
          title: 'Large transcript',
          verifierConfig: {
            requiredEvidence: [{ modality: 'text', scope: 'run_evidence', type: 'transcript' }],
          },
          verifierType: 'llm',
        },
      ],
      planConfirmedAt: new Date(),
    });
    mocks.evidenceListByRun.mockResolvedValue([
      {
        checkItemId: 'large-transcript',
        content: null,
        description: 'CLI output exceeding the inline limit',
        fileId: 'file-large-transcript',
        type: 'transcript',
      },
    ]);
    mocks.resultListByRun.mockReset().mockResolvedValue([]);
    const runVerifierAgent = vi.fn().mockResolvedValue({ verifierOperationId: 'verifier-op-text' });

    await new VerifyExecutorService({} as never, 'user-1').execute({
      deliverable: 'stored transcript',
      goal: 'verify the complete CLI output',
      reviewerAgentId: 'reviewer-1',
      operationId: 'builder-op-text',
      runVerifierAgent,
    });

    expect(runVerifierAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        checkItem: expect.objectContaining({ id: 'large-transcript' }),
        evidence: [
          expect.objectContaining({
            fileId: 'file-large-transcript',
            type: 'transcript',
          }),
        ],
      }),
    );
    expect(mocks.aiGenerateObject).not.toHaveBeenCalled();
  });

  it('hydrates document evidence before giving it to the reviewer', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      planConfirmedAt: new Date(),
      plan: [{ id: 'doc', index: 0, title: 'Document', required: true, verifierType: 'llm' }],
    });
    mocks.resultListByRun.mockReset().mockResolvedValue([]);
    mocks.documentFindByIds.mockResolvedValue([
      { id: 'document-1', content: 'captured document content' },
    ]);
    mocks.evidenceListByRun.mockResolvedValue([
      {
        checkItemId: 'doc',
        documentId: 'document-1',
        description: 'Document evidence',
        type: 'text',
      },
    ]);
    const runVerifierAgent = vi.fn().mockResolvedValue({ verifierOperationId: 'review-op' });
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(runVerifierAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [expect.objectContaining({ content: 'captured document content' })],
      }),
    );
    expect(mocks.aiGenerateObject).not.toHaveBeenCalled();
  });

  it('runs every text check in a separate reviewer session using the result tool', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      planConfirmedAt: new Date(),
      plan: ['a', 'b'].map((id) => ({
        id,
        index: 0,
        title: id,
        required: true,
        verifierType: 'llm',
      })),
    });
    mocks.resultListByRun.mockReset().mockResolvedValue([]);
    const runVerifierAgent = vi.fn().mockImplementation(async ({ checkItem }) => ({
      verifierOperationId: `review-${checkItem.id}`,
      initiatingMessage: `Review ${checkItem.id}`,
    }));
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(runVerifierAgent).toHaveBeenCalledTimes(2);
    for (const id of ['a', 'b'])
      expect(mocks.resultUpdateByCheckItem).toHaveBeenCalledWith(
        'run-1',
        id,
        expect.objectContaining({
          verifierOperationId: `review-${id}`,
          metadata: expect.objectContaining({ initiatingMessage: `Review ${id}` }),
        }),
      );
    expect(mocks.aiGenerateObject).not.toHaveBeenCalled();
  });

  it('routes visual evidence to the saved reviewer without a model catalog lookup', async () => {
    mocks.modelProperty.mockResolvedValue({ vision: true });
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      plan: [
        {
          id: 'visual',
          index: 0,
          required: true,
          title: 'Visual',
          verifierConfig: {
            requiredEvidence: [{ modality: 'image', scope: 'run_evidence', type: 'screenshot' }],
          },
          verifierType: 'llm',
        },
      ],
      planConfirmedAt: new Date(),
    });
    mocks.evidenceListByRun.mockResolvedValue([
      {
        checkItemId: 'visual',
        description: 'screen',
        fileId: 'file-1',
        type: 'screenshot',
      },
    ]);
    mocks.resultListByRun.mockReset().mockResolvedValue([]);
    mocks.aiGenerateObject.mockResolvedValue({
      confidence: 1,
      evidence: 'visible',
      reasoning: 'visible',
      verdict: 'passed',
    });

    const runVerifierAgent = vi.fn().mockResolvedValue({ verifierOperationId: 'visual-review' });
    await new VerifyExecutorService({} as never, 'user-1').execute({
      deliverable: 'done',
      goal: 'ship',
      reviewerAgentId: 'reviewer-1',
      operationId: 'op-1',
      runVerifierAgent,
    });

    expect(runVerifierAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: [expect.objectContaining({ fileId: 'file-1', type: 'screenshot' })],
      }),
    );
    expect(mocks.aiGenerateObject).not.toHaveBeenCalled();
    expect(mocks.modelProperty).not.toHaveBeenCalled();
  });
  it('does not start another check after a person accepted the pending result', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      planConfirmedAt: new Date(),
      plan: [
        {
          id: 'manual',
          index: 0,
          required: true,
          title: 'Accepted pending',
          verifierType: 'agent',
        },
      ],
    });
    mocks.resultListByRun
      .mockReset()
      .mockResolvedValue([{ checkItemId: 'manual', status: 'running', userDecision: 'accepted' }]);
    const runVerifierAgent = vi.fn();
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(runVerifierAgent).not.toHaveBeenCalled();
    expect(mocks.aiGenerateObject).not.toHaveBeenCalled();
  });
  it('preserves completed checks when a partially completed plan is reclaimed', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      planConfirmedAt: new Date(),
      plan: [
        {
          id: 'finished',
          index: 0,
          required: true,
          title: 'Already passed',
          verifierType: 'agent',
        },
      ],
    });
    mocks.resultListByRun
      .mockReset()
      .mockResolvedValue([{ checkItemId: 'finished', status: 'passed', verdict: 'passed' }]);
    const runVerifierAgent = vi.fn();
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(runVerifierAgent).not.toHaveBeenCalled();
    expect(mocks.resultUpdateByCheckItem).not.toHaveBeenCalled();
  });
  it('does not materialize or launch checks after an aggregate delivery decision', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      userDecision: 'accept',
      planConfirmedAt: new Date(),
      plan: [
        { id: 'not-yet-created', index: 0, title: 'Check', required: true, verifierType: 'llm' },
      ],
    });
    const runVerifierAgent = vi.fn();
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(mocks.resultCreateMany).not.toHaveBeenCalled();
    expect(runVerifierAgent).not.toHaveBeenCalled();
  });
  it('binds a fresh retry after an earlier reviewer error without a verdict', async () => {
    mocks.runEnsureForOperation.mockResolvedValue({
      id: 'run-1',
      planConfirmedAt: new Date(),
      plan: [
        { id: 'retry', index: 0, title: 'Retry check', required: true, verifierType: 'agent' },
      ],
    });
    mocks.resultListByRun.mockReset().mockResolvedValue([
      {
        checkItemId: 'retry',
        status: 'errored',
        verdict: null,
        verifierOperationId: 'old-op',
        completedAt: new Date(),
        toulmin: { limitation: 'prior error' },
      },
    ]);
    const runVerifierAgent = vi.fn().mockResolvedValue({
      verifierOperationId: 'new-op',
      initiatingMessage: 'Fresh review request',
    });
    await new VerifyExecutorService({} as never, 'user-1').execute({
      operationId: 'op-1',
      reviewerAgentId: 'reviewer-1',
      goal: 'ship',
      deliverable: 'done',
      runVerifierAgent,
    });
    expect(mocks.resultUpdateByCheckItem).toHaveBeenCalledWith(
      'run-1',
      'retry',
      expect.objectContaining({
        verifierOperationId: 'new-op',
        status: 'running',
        completedAt: null,
        toulmin: null,
        suggestion: null,
      }),
    );
  });
});

import { VerifyToolIdentifier } from '@orvilo/builtin-tool-verify';
import type { VerifyCheckItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VerifyCheckResultModel } from '@/database/models/verifyCheckResult';

import { createVerifierAgentRunner } from '../agentVerifier';

// AgentModel exposes its methods as arrow-function class fields
// (instance props, not on the prototype), so they can't be spied via the
// prototype — mock the modules instead. Hoisted so the factories can close over them.
const { getReviewerMock, execAgentMock, settleVerifierCheckFromTerminalMock } = vi.hoisted(() => ({
  execAgentMock: vi.fn(async (_params: any) => ({ operationId: 'verifier-op-1' })),
  getReviewerMock: vi.fn(),
  settleVerifierCheckFromTerminalMock: vi.fn(),
}));

/** The single execAgent param object, asserted to exist. */
const execParams = (): any => {
  const call = execAgentMock.mock.calls[0];
  expect(call).toBeDefined();
  return call![0];
};

vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn().mockImplementation(function () {
    return { findById: vi.fn().mockResolvedValue(null) };
  }),
}));

vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn().mockImplementation(function () {
    return { findByOperation: vi.fn().mockResolvedValue({ id: 'run-1' }) };
  }),
}));
vi.mock('@/database/models/verifyCheckResult', () => ({
  VerifyCheckResultModel: vi.fn().mockImplementation(function () {
    return {
      listByRun: vi.fn().mockResolvedValue([{ checkItemId: 'check-1' }]),
      updateByCheckItem: vi.fn(),
    };
  }),
}));

vi.mock('../reviewerAgent', () => ({ resolveIssueReviewer: getReviewerMock }));
// The runner dynamically imports AiAgentService to break a static cycle.
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return { execAgent: execAgentMock };
  }),
}));
vi.mock('../verifierTerminal', () => ({
  settleVerifierCheckFromTerminal: settleVerifierCheckFromTerminalMock,
}));

const checkItem: VerifyCheckItem = {
  id: 'check-1',
  index: 0,
  onFail: 'manual',
  required: true,
  title: 'Toolbar renders',
  verifierConfig: {},
  verifierType: 'agent',
};

const runnerArgs = { checkItem, goal: 'ship the toolbar', operationId: 'parent-op-1' };
const db = {} as any;

const baseParams = {
  db,
  deliverable: 'the toolbar',
  taskId: 'task-1',
  topicId: 'topic-1',
  userId: 'u',
};

describe('createVerifierAgentRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execAgentMock.mockResolvedValue({ operationId: 'verifier-op-1' });
    getReviewerMock.mockResolvedValue('agent-codex');
  });

  it('returns undefined without an Issue binding', () => {
    const runner = createVerifierAgentRunner({ db, deliverable: 'x', userId: 'u' });
    expect(runner).toBeUndefined();
  });

  it('runs a pinned agent by agentId, keeping its own model/provider', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    const result = await runner(runnerArgs);

    expect(result).toEqual(expect.objectContaining({ verifierOperationId: 'verifier-op-1' }));
    expect(getReviewerMock).toHaveBeenCalledWith(db, 'u', 'task-1', undefined);

    const params = execParams();
    expect(params.agentId).toBe('agent-codex');
    // A pinned agent keeps its own agency — never overridden by the parent run.
    expect(params.slug).toBeUndefined();
    expect(params.model).toBeUndefined();
    expect(params.provider).toBeUndefined();
    expect(params.instructions).toBeUndefined();
    expect(params.topicId).toBeUndefined();
    // A pinned agent lacks the writeback tool, so it must be injected.
    expect(params.additionalPluginIds).toEqual([VerifyToolIdentifier]);
  });

  it.each(['missing reviewer', 'deleted reviewer', 'unsupported runtime', 'Agent Use denied'])(
    'never executes a fallback when %s',
    async (reason) => {
      getReviewerMock.mockRejectedValue(new Error(reason));
      const runner = createVerifierAgentRunner(baseParams)!;
      await expect(runner(runnerArgs)).rejects.toThrow(reason);
      expect(execAgentMock).not.toHaveBeenCalled();
    },
  );

  it('registers a verifier-terminal hook for local and queued completion handling', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams, workspaceId: 'ws-1' })!;
    await runner(runnerArgs);

    const hooks = execParams().hooks;
    expect(hooks).toEqual([
      expect.objectContaining({
        id: 'reviewer-terminal',
        type: 'onComplete',
        webhook: expect.objectContaining({
          body: {
            checkItemId: 'check-1',
            parentOperationId: 'parent-op-1',
            userId: 'u',
            workspaceId: 'ws-1',
          },
          delivery: 'hatchet',
          url: '/api/workflows/verify/on-verifier-complete',
        }),
      }),
    ]);

    await hooks[0].handler({
      agentId: 'agent',
      errorMessage: 'bad key',
      operationId: 'verifier-op-1',
      reason: 'error',
      userId: 'u',
    });

    expect(settleVerifierCheckFromTerminalMock).toHaveBeenCalledWith(
      db,
      'u',
      {
        checkItemId: 'check-1',
        errorMessage: 'bad key',
        parentOperationId: 'parent-op-1',
        reason: 'error',
        verifierOperationId: 'verifier-op-1',
      },
      'ws-1',
    );
  });

  it('keeps the parent task scope while starting a fresh isolated topic', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner(runnerArgs);

    expect(execParams().appContext).toEqual({ taskId: 'task-1' });
  });

  it('injects the builder-captured evidence into the verifier prompt', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner({
      ...runnerArgs,
      evidence: [
        { description: 'toolbar screenshot', type: 'screenshot' },
        { content: 'aria-label="Send"', description: 'DOM', type: 'dom_snapshot' },
      ],
    });

    const prompt: string = execParams().prompt;
    expect(prompt).toContain('## Captured evidence');
    expect(prompt).toContain('toolbar screenshot');
    expect(prompt).toContain('[artifact captured]'); // screenshot referenced by presence
    expect(prompt).toContain('aria-label="Send"'); // inline dom text quoted
  });

  it('omits the captured-evidence section when no evidence was provided', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner(runnerArgs);

    expect(execParams().prompt).not.toContain('## Captured evidence');
  });

  it('attaches file-backed evidence to the verifier run so it can see the artifact', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner({
      ...runnerArgs,
      evidence: [
        { description: 'toolbar', fileId: 'file-shot-1', type: 'screenshot' },
        { content: 'inline only', type: 'dom_snapshot' }, // no fileId
        { description: 'demo', fileId: 'file-vid-1', type: 'video' },
      ],
    });

    // Only the file-backed artifacts are forwarded to execAgent (inline-text has none).
    expect(execParams().fileIds).toEqual(['file-shot-1', 'file-vid-1']);
  });

  it('does not pass fileIds when no evidence is file-backed', async () => {
    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner({ ...runnerArgs, evidence: [{ content: 'text', type: 'text' }] });

    expect(execParams().fileIds).toBeUndefined();
  });
  it('binds the minted reviewer operation to its check before dispatch', async () => {
    execAgentMock.mockImplementationOnce(async (params) => {
      await params.beforeOperationStart({ operationId: 'reviewer-minted', topicId: 'fresh-topic' });
      return { operationId: 'reviewer-minted' };
    });
    await createVerifierAgentRunner(baseParams)!(runnerArgs);
    const model = vi.mocked(VerifyCheckResultModel).mock.results[0].value;
    expect(model.updateByCheckItem).toHaveBeenCalledWith('run-1', 'check-1', {
      metadata: {
        reviewerOperationId: 'reviewer-minted',
        initiatingMessage: expect.stringContaining('Issue task-1'),
      },
      verifierOperationId: null,
    });
  });
});

import { VerifyToolIdentifier } from '@orvilo/builtin-tool-verify';
import type { VerifyCheckItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createVerifierAgentRunner } from '../agentVerifier';

// AgentModel exposes its methods as arrow-function class fields
// (instance props, not on the prototype), so they can't be spied via the
// prototype — mock the modules instead. Hoisted so the factories can close over them.
const { existsByIdMock, getBuiltinAgentMock, execAgentMock, settleVerifierCheckFromTerminalMock } =
  vi.hoisted(() => ({
    execAgentMock: vi.fn(async (_params: any) => ({ operationId: 'verifier-op-1' })),
    existsByIdMock: vi.fn(),
    getBuiltinAgentMock: vi.fn(),
    settleVerifierCheckFromTerminalMock: vi.fn(),
  }));

/** The single execAgent param object, asserted to exist. */
const execParams = (): any => {
  const call = execAgentMock.mock.calls[0];
  expect(call).toBeDefined();
  return call![0];
};

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn().mockImplementation(function () {
    return {
      existsById: existsByIdMock,
      getBuiltinAgent: getBuiltinAgentMock,
    };
  }),
}));
// The runner dynamically imports AiAgentService to break a static cycle.
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn().mockImplementation(function () {
    return { execAgent: execAgentMock };
  }),
}));
vi.mock('@/server/services/agent/builtinRuntimeCreation', () => ({
  getExecutableBuiltinAgent: (_db: unknown, _userId: string, slug: string) =>
    getBuiltinAgentMock(slug),
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

const runnerArgs = {
  checkItem,
  orchestrationWorkflow: 'ship the toolbar',
  operationId: 'parent-op-1',
};
const db = {} as any;

const baseParams = {
  db,
  deliverable: 'the toolbar',
  model: 'gpt-parent',
  provider: 'openai',
  taskId: 'task-1',
  topicId: 'topic-1',
  userId: 'u',
};

describe('createVerifierAgentRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execAgentMock.mockResolvedValue({ operationId: 'verifier-op-1' });
  });

  it('returns undefined without a topicId (no thread to host the verifier)', () => {
    const runner = createVerifierAgentRunner({ db, deliverable: 'x', topicId: null, userId: 'u' });
    expect(runner).toBeUndefined();
  });

  it('runs a pinned agent by agentId, keeping its own model/provider', async () => {
    existsByIdMock.mockResolvedValue(true);

    const runner = createVerifierAgentRunner({ ...baseParams, verifierAgentId: 'agent-codex' })!;
    const result = await runner(runnerArgs);

    expect(result).toEqual({ verifierOperationId: 'verifier-op-1' });
    expect(existsByIdMock).toHaveBeenCalledWith('agent-codex');
    expect(getBuiltinAgentMock).not.toHaveBeenCalled();

    const params = execParams();
    expect(params.agentId).toBe('agent-codex');
    // A pinned agent keeps its own agency — never overridden by the parent run.
    expect(params.slug).toBeUndefined();
    expect(params.model).toBeUndefined();
    expect(params.provider).toBeUndefined();
    // A pinned agent lacks the writeback tool, so it must be injected.
    expect(params.additionalPluginIds).toEqual([VerifyToolIdentifier]);
  });

  it('blocks a missing pinned verifier instead of silently replacing it', async () => {
    existsByIdMock.mockResolvedValue(false);
    const runner = createVerifierAgentRunner({ ...baseParams, verifierAgentId: 'agent-deleted' })!;
    await expect(runner(runnerArgs)).rejects.toThrow('VERIFIER_AGENT_UNAVAILABLE');
    expect(getBuiltinAgentMock).not.toHaveBeenCalled();
    expect(execAgentMock).not.toHaveBeenCalled();
  });

  it('keeps the bound builtin native runtime without server model overrides', async () => {
    getBuiltinAgentMock.mockResolvedValue({
      id: 'builtin-verify',
      model: 'opencode',
      agencyConfig: {
        boundDeviceId: 'registered-host',
        executionTarget: 'device',
        heterogeneousProvider: { type: 'opencode' },
      },
    });
    await createVerifierAgentRunner(baseParams)!(runnerArgs);
    expect(execParams().model).toBeUndefined();
    expect(execParams().provider).toBeUndefined();
    expect(execParams().skipTaskVerification).toBe(true);
    expect(execParams().chatConfigOverride).toEqual({ enableAgentMode: true, toolMode: 'custom' });
    expect(execParams().requiredToolIds).toEqual([VerifyToolIdentifier]);
  });

  it('registers a verifier-terminal hook for local and queued completion handling', async () => {
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

    const runner = createVerifierAgentRunner({ ...baseParams, workspaceId: 'ws-1' })!;
    await runner(runnerArgs);

    const hooks = execParams().hooks;
    expect(hooks).toEqual([
      expect.objectContaining({
        id: 'verify-agent-terminal',
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

  it('uses the builtin agent when no verifierAgentId is pinned', async () => {
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner(runnerArgs);

    // No pinned id → never probes existsById, goes straight to the builtin.
    expect(existsByIdMock).not.toHaveBeenCalled();
    expect(execParams().agentId).toBe('builtin-verify');
    expect(execParams().slug).toBeUndefined();
  });

  it('keeps the parent task scope while starting a fresh isolated topic', async () => {
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner(runnerArgs);

    expect(execParams().appContext).toEqual({ taskId: 'task-1' });
  });

  it('injects the builder-captured evidence into the verifier prompt', async () => {
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

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
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner(runnerArgs);

    expect(execParams().prompt).not.toContain('## Captured evidence');
  });

  it('attaches file-backed evidence to the verifier run so it can see the artifact', async () => {
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

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
    getBuiltinAgentMock.mockResolvedValue({ id: 'builtin-verify' });

    const runner = createVerifierAgentRunner({ ...baseParams })!;
    await runner({ ...runnerArgs, evidence: [{ content: 'text', type: 'text' }] });

    expect(execParams().fileIds).toBeUndefined();
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACP_JUDGMENT_AGENT_ENV,
  AcpJudgmentBindingError,
  AcpJudgmentRunError,
  extractJudgmentJson,
  isAcpJudgmentBindingError,
  resolveAcpJudgmentAgent,
  runAcpJudgment,
  serializeJudgmentMessages,
} from './judgment';

const mocks = vi.hoisted(() => ({
  agentExistsById: vi.fn(),
  agentGetBuiltin: vi.fn(),
  execAgent: vi.fn(),
  interruptTask: vi.fn(),
  messageFindById: vi.fn(),
  operationFindById: vi.fn(),
  tracingIsEnabled: vi.fn(),
  tracingRecord: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(function () {
    return {
      existsById: mocks.agentExistsById,
      getBuiltinAgent: mocks.agentGetBuiltin,
    };
  }),
}));
vi.mock('@/database/models/agentOperation', () => ({
  AgentOperationModel: vi.fn(function () {
    return { findById: mocks.operationFindById };
  }),
}));
vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn(function () {
    return { findById: mocks.messageFindById };
  }),
}));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { execAgent: mocks.execAgent, interruptTask: mocks.interruptTask };
  }),
}));
vi.mock('@/server/services/llmGenerationTracing', () => ({
  getLLMGenerationTracingService: () => ({
    isEnabled: mocks.tracingIsEnabled,
    record: mocks.tracingRecord,
  }),
}));
vi.mock('@orvilo/llm-generation-tracing', () => ({
  computePromptHash: vi.fn(() => 'prompt-hash'),
  resolveScenario: vi.fn((input: { promptVersion?: string; scenario?: string } = {}) => ({
    promptVersion: input.promptVersion ?? 'unversioned',
    scenario: input.scenario ?? 'unknown',
  })),
}));

const db = {} as never;

const doneOperation = {
  agentId: 'agent-1',
  id: 'op-1',
  metadata: { assistantMessageId: 'msg-1' },
  model: 'gpt-4o',
  processingTimeMs: 120,
  provider: 'openai',
  status: 'done',
  totalCost: 0.001,
  totalInputTokens: 100,
  totalOutputTokens: 50,
  topicId: 'topic-1',
};

const JUDGMENT_INPUT = {
  messages: [
    { content: 'You are a judge.', role: 'system' as const },
    { content: 'Decide.', role: 'user' as const },
  ],
  schema: { name: 'Verdict', schema: { properties: {}, type: 'object' as const } },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[ACP_JUDGMENT_AGENT_ENV];
  mocks.agentExistsById.mockResolvedValue(false);
  mocks.agentGetBuiltin.mockResolvedValue(null);
  mocks.execAgent.mockResolvedValue({ operationId: 'op-1' });
  mocks.interruptTask.mockResolvedValue(undefined);
  mocks.operationFindById.mockResolvedValue(doneOperation);
  mocks.messageFindById.mockResolvedValue({ content: '{"verdict":"passed"}' });
  mocks.tracingIsEnabled.mockReturnValue(true);
  mocks.tracingRecord.mockResolvedValue({ tracingId: 'tr-1' });
});

describe('resolveAcpJudgmentAgent — binding precedence, never deployment keys', () => {
  it('pins an existing user agent by id', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    await expect(resolveAcpJudgmentAgent(db, 'u1', { agentId: 'agent-1' })).resolves.toEqual({
      agentId: 'agent-1',
    });
    expect(mocks.agentGetBuiltin).not.toHaveBeenCalled();
  });

  it('falls through a stale agentId to a builtin slug', async () => {
    mocks.agentGetBuiltin.mockResolvedValue({ id: 'builtin-verify' });
    await expect(
      resolveAcpJudgmentAgent(db, 'u1', { agentId: 'gone', slug: 'verify-agent' }),
    ).resolves.toEqual({ slug: 'verify-agent' });
  });

  it('uses ACP_JUDGMENT_AGENT_ID only when the domain binding resolves to nothing', async () => {
    process.env[ACP_JUDGMENT_AGENT_ENV] = 'env-agent';
    mocks.agentExistsById.mockImplementation(async (id: string) => id === 'env-agent');
    await expect(resolveAcpJudgmentAgent(db, 'u1', {})).resolves.toEqual({
      agentId: 'env-agent',
    });
  });

  it('returns undefined when nothing binds — the explicit-block condition', async () => {
    await expect(resolveAcpJudgmentAgent(db, 'u1', {})).resolves.toBeUndefined();
  });

  it('honors allowEnvFallback:false even when the env var is set', async () => {
    process.env[ACP_JUDGMENT_AGENT_ENV] = 'env-agent';
    mocks.agentExistsById.mockResolvedValue(true);
    await expect(
      resolveAcpJudgmentAgent(db, 'u1', { allowEnvFallback: false }),
    ).resolves.toBeUndefined();
  });
});

describe('runAcpJudgment', () => {
  it('dispatches a headless, tool-free ACP operation with the judgment marker', async () => {
    mocks.agentExistsById.mockResolvedValue(true);

    const result = await runAcpJudgment<{ verdict: string }>(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        attempt: 2,
        binding: { agentId: 'agent-1' },
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        taskId: 'task-9',
      },
    });

    expect(result.data).toEqual({ verdict: 'passed' });
    expect(result.run).toMatchObject({
      assistantMessageId: 'msg-1',
      operationId: 'op-1',
      status: 'done',
      totalCost: 0.001,
      totalInputTokens: 100,
      totalOutputTokens: 50,
    });

    const execArgs = mocks.execAgent.mock.calls[0][0];
    expect(execArgs).toMatchObject({
      agentId: 'agent-1',
      autoStart: true,
      disableTools: true,
      maxSteps: 4,
      taskId: 'task-9',
      title: '[judgment] verify.judge',
      trigger: 'acp_judgment',
      userInterventionConfig: { approvalMode: 'headless' },
    });
    // Operation/attempt/budget recorded on the durable row.
    expect(execArgs.appContext).toMatchObject({
      judgment: {
        attempt: 2,
        budget: { maxSteps: 4, maxWaitMs: 180_000 },
        purpose: 'verify.judge',
      },
      suppressSignal: true,
      taskId: 'task-9',
    });
    // System/developer turns ride instructions; the user turn + output
    // contract compose the prompt.
    expect(execArgs.instructions).toContain('You are a judge.');
    expect(execArgs.prompt).toContain('USER:\nDecide.');
    expect(execArgs.prompt).toContain('## Output contract');
  });

  it('writes the llm_generation_tracing row linked to the operation', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    const onPersisted = vi.fn();

    await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        tracing: { onPersisted, scenario: 'verify_judge' },
      },
    });

    expect(mocks.tracingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.tracingRecord.mock.calls[0][0]).toMatchObject({
      agentId: 'agent-1',
      costUsd: 0.001,
      inputTokens: 100,
      metadata: { operationId: 'op-1' },
      model: 'gpt-4o',
      outputTokens: 50,
      success: true,
      trigger: 'acp_judgment',
      userId: 'u1',
    });
    expect(onPersisted).toHaveBeenCalledWith('tr-1');
  });

  it('throws AcpJudgmentBindingError and never dispatches when nothing binds', async () => {
    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: { binding: {}, pollIntervalMs: 1, purpose: 'task.brief' },
      }),
    ).rejects.toBeInstanceOf(AcpJudgmentBindingError);
    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: { binding: {}, pollIntervalMs: 1, purpose: 'task.brief' },
      }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_NO_BINDING' });
    expect(mocks.execAgent).not.toHaveBeenCalled();
  });

  it('fails the judgment on a non-done terminal operation and still traces it', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindById.mockResolvedValue({
      ...doneOperation,
      error: { message: 'model blew up' },
      status: 'error',
    });

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: { binding: { agentId: 'agent-1' }, pollIntervalMs: 1, purpose: 'verify.judge' },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AcpJudgmentRunError);
    expect(error).toMatchObject({
      code: 'ACP_JUDGMENT_RUN_FAILED',
      operationId: 'op-1',
      status: 'error',
    });
    expect(mocks.tracingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'error', success: false }),
    );
  });

  it('rejects a finished run whose reply carries no parseable JSON', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.messageFindById.mockResolvedValue({ content: 'no json here at all' });

    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: { binding: { agentId: 'agent-1' }, pollIntervalMs: 1, purpose: 'verify.judge' },
      }),
    ).rejects.toBeInstanceOf(AcpJudgmentRunError);
  });

  it('interrupts the operation when the wait budget is exceeded', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'running' });

    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: {
          binding: { agentId: 'agent-1' },
          pollIntervalMs: 1,
          purpose: 'verify.judge',
          timeoutMs: 5,
        },
      }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_RUN_FAILED', operationId: 'op-1' });
    expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-1' });
  });

  it('propagates caller cancellation to interruptTask', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'running' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: {
          binding: { agentId: 'agent-1' },
          pollIntervalMs: 1,
          purpose: 'verify.judge',
          signal: controller.signal,
        },
      }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_RUN_FAILED', status: 'interrupted' });
    expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-1' });
  });

  it('keeps a pinned agent on its own model config — no advisory override leaks in', async () => {
    mocks.agentExistsById.mockResolvedValue(true);

    await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        model: 'claude-3-5',
        pollIntervalMs: 1,
        provider: 'anthropic',
        purpose: 'verify.judge',
      },
    });

    const execArgs = mocks.execAgent.mock.calls[0][0];
    expect(execArgs.model).toBeUndefined();
    expect(execArgs.provider).toBeUndefined();
  });

  it('applies the advisory model/provider only for slug-bound builtins', async () => {
    mocks.agentGetBuiltin.mockResolvedValue({ id: 'builtin-verify' });

    await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { slug: 'verify-agent' },
        model: 'claude-3-5',
        pollIntervalMs: 1,
        provider: 'anthropic',
        purpose: 'verify.judge',
      },
    });

    const execArgs = mocks.execAgent.mock.calls[0][0];
    expect(execArgs).toMatchObject({
      model: 'claude-3-5',
      provider: 'anthropic',
      slug: 'verify-agent',
    });
  });
});

describe('serializeJudgmentMessages', () => {
  it('routes system/developer turns to instructions and the rest to the prompt', () => {
    const { instructions, prompt } = serializeJudgmentMessages([
      { content: 'sys', role: 'system' },
      { content: 'dev', role: 'developer' },
      { content: 'hello', role: 'user' },
      { content: 'partial', role: 'assistant' },
    ]);
    expect(instructions).toBe('sys\n\ndev');
    expect(prompt).toBe('USER:\nhello\n\nASSISTANT:\npartial');
  });
});

describe('extractJudgmentJson', () => {
  it('parses bare JSON, fenced JSON, and prose-wrapped objects', () => {
    expect(extractJudgmentJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJudgmentJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJudgmentJson('Sure! Here is the result: {"a":3} done')).toEqual({ a: 3 });
  });

  it('returns undefined when no object exists', () => {
    expect(extractJudgmentJson('totally empty')).toBeUndefined();
  });
});

describe('isAcpJudgmentBindingError', () => {
  it('matches the typed error and any carried code', () => {
    expect(isAcpJudgmentBindingError(new AcpJudgmentBindingError('x'))).toBe(true);
    expect(isAcpJudgmentBindingError({ code: 'ACP_JUDGMENT_NO_BINDING' })).toBe(true);
    expect(isAcpJudgmentBindingError(new Error('nope'))).toBe(false);
  });
});

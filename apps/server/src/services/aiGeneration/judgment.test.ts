// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACP_JUDGMENT_AGENT_ENV,
  AcpJudgmentBindingError,
  AcpJudgmentRunError,
  AcpJudgmentValidationError,
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
  operationBindLaunch: vi.fn(),
  operationClaimLaunch: vi.fn(),
  operationFindById: vi.fn(),
  operationFindByJudgmentIntent: vi.fn(),
  operationFindLaunchById: vi.fn(),
  operationRequestLaunchCancel: vi.fn(),
  operationSettleLaunch: vi.fn(),
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
    return {
      bindOperationLaunch: mocks.operationBindLaunch,
      claimOperationLaunch: mocks.operationClaimLaunch,
      findById: mocks.operationFindById,
      findByJudgmentIntent: mocks.operationFindByJudgmentIntent,
      findOperationLaunchById: mocks.operationFindLaunchById,
      requestOperationLaunchCancel: mocks.operationRequestLaunchCancel,
      settleOperationLaunch: mocks.operationSettleLaunch,
    };
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
  mocks.interruptTask.mockResolvedValue({ cancelState: 'confirmed', success: true });
  mocks.operationBindLaunch.mockImplementation(async (id: string, operationId: string) => ({
    id,
    operationId,
    status: 'dispatched',
  }));
  mocks.operationClaimLaunch.mockImplementation(async (input: { intentKey: string }) => ({
    claimed: true,
    launch: {
      deadlineAt: new Date(Date.now() + 180_000),
      id: 'launch-1',
      intentKey: input.intentKey,
      status: 'claimed',
    },
  }));
  mocks.operationFindLaunchById.mockResolvedValue(null);
  mocks.operationRequestLaunchCancel.mockResolvedValue(null);
  mocks.operationSettleLaunch.mockResolvedValue(null);
  mocks.operationFindById.mockResolvedValue(doneOperation);
  mocks.operationFindByJudgmentIntent.mockResolvedValue(null);
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

  it('blocks when a pinned agentId no longer exists — no slug/env fallthrough (F10)', async () => {
    mocks.agentGetBuiltin.mockResolvedValue({ id: 'builtin-verify' });
    process.env[ACP_JUDGMENT_AGENT_ENV] = 'env-agent';
    // An explicitly pinned execution identity that died is a hard boundary:
    // slug/env candidates are never consulted.
    await expect(
      resolveAcpJudgmentAgent(db, 'u1', { agentId: 'gone', slug: 'verify-agent' }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_NO_BINDING' });
    expect(mocks.agentGetBuiltin).not.toHaveBeenCalled();
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
    // Operation/attempt/budget/intent recorded on the durable row.
    expect(execArgs.appContext).toMatchObject({
      judgment: {
        attempt: 2,
        budget: { maxSteps: 4, maxWaitMs: 180_000 },
        intentKey: expect.stringContaining('verify.judge:2:'),
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
    // Cover the deadline landing inside dispatch: the intent reconcile finds
    // the same row the operationId path would.
    mocks.operationFindByJudgmentIntent.mockResolvedValue({
      ...doneOperation,
      status: 'running',
    });

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
    expect(mocks.tracingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.tracingRecord.mock.calls[0][0]).toMatchObject({
      errorCode: 'timeout',
      metadata: expect.objectContaining({ operationId: 'op-1' }),
      success: false,
    });
  });

  it('propagates caller cancellation to interruptTask and reports the cancel authority', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    // The abort can win the dispatch race before execAgent resolves — the
    // landed row is recovered through the intentKey reconcile, not a re-issue.
    mocks.operationFindByJudgmentIntent.mockResolvedValue({
      ...doneOperation,
      status: 'running',
    });
    mocks.operationFindById
      .mockResolvedValueOnce({ ...doneOperation, status: 'running' })
      .mockResolvedValue({ ...doneOperation, status: 'interrupted' });
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
    ).rejects.toMatchObject({
      cancelResult: 'confirmed',
      code: 'ACP_JUDGMENT_RUN_FAILED',
      status: 'interrupted',
    });
    expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-1' });
    expect(mocks.tracingRecord).toHaveBeenCalledTimes(1);
    expect(mocks.tracingRecord.mock.calls[0][0]).toMatchObject({
      errorCode: 'interrupted',
      metadata: expect.objectContaining({ operationId: 'op-1' }),
      success: false,
    });
  });

  it('reports cancelResult unknown — never claims interrupted — when the cancel cannot be confirmed (F10)', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    // The row stays 'running' even after interruptTask resolves: the cancel
    // outcome is unknown and must not be reported as interrupted.
    mocks.operationFindByJudgmentIntent.mockResolvedValue({
      ...doneOperation,
      status: 'running',
    });
    mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'running' });
    mocks.interruptTask.mockResolvedValue({ cancelState: 'unknown', success: true });
    const controller = new AbortController();
    controller.abort();

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        signal: controller.signal,
      },
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      cancelResult: 'unknown',
      code: 'ACP_JUDGMENT_RUN_FAILED',
      status: 'running',
    });
  });

  it('counts dispatch latency against the total budget — deadline precedes execAgent (F10)', async () => {
    vi.useFakeTimers();
    try {
      mocks.agentExistsById.mockResolvedValue(true);
      mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'running' });
      // Dispatch itself takes 5s while the judgment budget is 1s: the run
      // must fail on the deadline the moment the dispatch resolves.
      mocks.execAgent.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ operationId: 'op-1' }), 5_000);
          }),
      );
      // The dispatch return is lost to the deadline — the landed row is
      // recovered through appContext.judgment.intentKey, never re-dispatched.
      mocks.operationFindByJudgmentIntent.mockResolvedValue({
        ...doneOperation,
        status: 'running',
      });

      const promise = runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: {
          binding: { agentId: 'agent-1' },
          pollIntervalMs: 100,
          purpose: 'verify.judge',
          timeoutMs: 1_000,
        },
      });
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(6_000);

      await expect(promise).rejects.toMatchObject({
        code: 'ACP_JUDGMENT_RUN_FAILED',
        operationId: 'op-1',
      });
      // Deadline exceeded: the op never got a full extra budget post-dispatch.
      expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed on a schema-mismatched reply and traces it as a failure (F10)', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.messageFindById.mockResolvedValue({ content: '{"unexpected":true}' });

    const strictInput = {
      messages: [{ content: 'Decide.', role: 'user' as const }],
      schema: {
        name: 'Verdict',
        schema: {
          properties: { verdict: { type: 'string' } },
          required: ['verdict'],
          type: 'object' as const,
        },
      },
    };

    const error = await runAcpJudgment(db, 'u1', {
      input: strictInput,
      judgment: { binding: { agentId: 'agent-1' }, pollIntervalMs: 1, purpose: 'verify.judge' },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AcpJudgmentValidationError);
    expect(error).toMatchObject({
      code: 'ACP_JUDGMENT_SCHEMA_MISMATCH',
      operationId: 'op-1',
    });
    // Execution succeeded but contract conformance failed — recorded as such.
    expect(mocks.tracingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'schema_mismatch', success: false }),
    );
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

  it('hard-blocks an explicit slug that does not resolve — env agents are never substituted (SA06-B)', async () => {
    process.env[ACP_JUDGMENT_AGENT_ENV] = 'env-agent';
    mocks.agentExistsById.mockResolvedValue(true); // env agent exists — must not be consulted

    await expect(
      resolveAcpJudgmentAgent(db, 'u1', { slug: 'missing-builtin' }),
    ).rejects.toMatchObject({ code: 'ACP_JUDGMENT_NO_BINDING' });
    expect(mocks.agentExistsById).not.toHaveBeenCalled();
  });

  it('keeps cancelResult unknown even when the row reads interrupted — DB is not physical authority (SA06-A)', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindByJudgmentIntent.mockResolvedValue({
      ...doneOperation,
      status: 'running',
    });
    // interruptTask reports the signal never provably landed, while the row
    // independently converges to 'interrupted' — the cancel authority stays
    // unknown, the honest terminal status is still reported.
    mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'interrupted' });
    mocks.interruptTask.mockResolvedValue({ cancelState: 'unknown', success: true });
    const controller = new AbortController();
    controller.abort();

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        signal: controller.signal,
      },
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      cancelResult: 'unknown',
      code: 'ACP_JUDGMENT_RUN_FAILED',
      status: 'interrupted',
    });
  });

  it('reports a natural done — never fabricates interrupted — when the cancel races a completed run (SA06-A)', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindByJudgmentIntent.mockResolvedValue({
      ...doneOperation,
      status: 'running',
    });
    mocks.operationFindById.mockResolvedValue(doneOperation);
    const controller = new AbortController();
    controller.abort();

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        signal: controller.signal,
      },
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      cancelResult: 'confirmed',
      code: 'ACP_JUDGMENT_RUN_FAILED',
      status: 'done',
    });
  });

  it('reconciles a hung dispatch by intentKey and interrupts it — never a second writer (SA06-A)', async () => {
    vi.useFakeTimers();
    try {
      mocks.agentExistsById.mockResolvedValue(true);
      mocks.execAgent.mockImplementation(() => new Promise(() => {})); // never returns
      mocks.operationFindByJudgmentIntent.mockResolvedValue({
        ...doneOperation,
        id: 'op-late',
        status: 'running',
      });
      mocks.operationFindById.mockResolvedValue({
        ...doneOperation,
        id: 'op-late',
        status: 'running',
      });

      const promise = runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: {
          binding: { agentId: 'agent-1' },
          pollIntervalMs: 100,
          purpose: 'verify.judge',
          timeoutMs: 1_000,
        },
      });
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(2_000);

      await expect(promise).rejects.toMatchObject({
        code: 'ACP_JUDGMENT_RUN_FAILED',
        operationId: 'op-late',
        status: 'interrupted',
      });
      expect(mocks.execAgent).toHaveBeenCalledTimes(1);
      expect(mocks.operationFindByJudgmentIntent).toHaveBeenCalledWith(
        expect.stringContaining('verify.judge:0:'),
      );
      expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-late' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces the deadline even when the op goes done late — the landed row is accounted for (SA06-A)', async () => {
    vi.useFakeTimers();
    try {
      mocks.agentExistsById.mockResolvedValue(true);
      mocks.execAgent.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ operationId: 'op-1' }), 5_000);
          }),
      );
      // The intent lookup finds the row already at 'done' — it is reported
      // honestly and no interrupt is fired at a finished run.
      mocks.operationFindByJudgmentIntent.mockResolvedValue(doneOperation);
      mocks.operationFindById.mockResolvedValue(doneOperation);

      const promise = runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: {
          binding: { agentId: 'agent-1' },
          pollIntervalMs: 100,
          purpose: 'verify.judge',
          timeoutMs: 1_000,
        },
      });
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(6_000);

      await expect(promise).rejects.toMatchObject({
        code: 'ACP_JUDGMENT_RUN_FAILED',
        operationId: 'op-1',
        status: 'done',
      });
      expect(mocks.execAgent).toHaveBeenCalledTimes(1);
      expect(mocks.interruptTask).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['plain text reply', 'no json here at all'],
    ['truncated JSON', '{"verdict":"pas'],
    ['JSON null literal', 'null'],
  ])('traces a %s as success=false with errorCode no_json (SA06-B)', async (_label, content) => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.messageFindById.mockResolvedValue({ content });

    await expect(
      runAcpJudgment(db, 'u1', {
        input: JUDGMENT_INPUT,
        judgment: { binding: { agentId: 'agent-1' }, pollIntervalMs: 1, purpose: 'verify.judge' },
      }),
    ).rejects.toBeInstanceOf(AcpJudgmentRunError);
    expect(mocks.tracingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'no_json', success: false }),
    );
  });
});

describe('runAcpJudgment launch registration (J01–J02)', () => {
  const adoptedLaunch = (overrides: Record<string, unknown> = {}) => ({
    deadlineAt: new Date(Date.now() + 180_000),
    id: 'launch-1',
    intentKey: 'ik-1',
    operationId: null,
    status: 'claimed',
    ...overrides,
  });

  it('J01 — registers the durable launch BEFORE any dispatch side effect', async () => {
    mocks.agentExistsById.mockResolvedValue(true);

    await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: { binding: { agentId: 'agent-1' }, pollIntervalMs: 1, purpose: 'verify.judge' },
    });

    expect(mocks.operationClaimLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        intentKey: expect.stringContaining('verify.judge:0:'),
        purpose: 'verify.judge',
      }),
    );
    expect(mocks.operationClaimLaunch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.execAgent.mock.invocationCallOrder[0],
    );
  });

  it('J01 — same intent concurrent calls share one launch and one operation', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationClaimLaunch
      .mockResolvedValueOnce({ claimed: true, launch: adoptedLaunch() })
      .mockResolvedValueOnce({
        claimed: false,
        launch: adoptedLaunch({ operationId: 'op-1', status: 'dispatched' }),
      });
    const params = {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        intentKey: 'ik-1',
        pollIntervalMs: 1,
        purpose: 'verify.judge',
      },
    };

    const first = runAcpJudgment<{ verdict: string }>(db, 'u1', params);
    // Let the first caller register its claim before the second arrives —
    // the second call is the concurrent same-intent retry.
    await vi.waitFor(() => expect(mocks.operationClaimLaunch).toHaveBeenCalledTimes(1));
    const second = runAcpJudgment<{ verdict: string }>(db, 'u1', params);
    const [a, b] = await Promise.all([first, second]);

    expect(a.run.operationId).toBe('op-1');
    expect(b.run.operationId).toBe('op-1');
    expect(mocks.execAgent).toHaveBeenCalledTimes(1);
  });

  it('J01 — a caller retry adopts the same launch after a lost spawn ACK', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    // The winner claimed the launch but died before binding the operation id;
    // the operation row still landed under the intent. A retry finds the
    // 'claimed' launch, late-binds the landed row, and reads its outcome —
    // no second writer is ever spawned.
    const orphaned = adoptedLaunch();
    mocks.operationClaimLaunch.mockResolvedValue({ claimed: false, launch: orphaned });
    mocks.operationFindLaunchById.mockResolvedValue(orphaned);
    mocks.operationFindByJudgmentIntent.mockResolvedValue(doneOperation);

    const result = await runAcpJudgment<{ verdict: string }>(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        intentKey: 'ik-1',
        pollIntervalMs: 1,
        purpose: 'verify.judge',
      },
    });

    expect(result.data).toEqual({ verdict: 'passed' });
    expect(result.run.operationId).toBe('op-1');
    expect(mocks.execAgent).not.toHaveBeenCalled();
    expect(mocks.operationBindLaunch).toHaveBeenCalledWith('launch-1', 'op-1');
    expect(mocks.operationSettleLaunch).toHaveBeenCalledWith('launch-1', 'settled');
  });

  it('J01 — failures carry the intentKey and converge the launch durably', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.execAgent.mockRejectedValue(new Error('spawn refused'));

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        intentKey: 'ik-fixed',
        pollIntervalMs: 1,
        purpose: 'verify.judge',
      },
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'ACP_JUDGMENT_RUN_FAILED', intentKey: 'ik-fixed' });
    // Cancel intent persisted on the launch row before the interrupt — the
    // converge is durable, not an unawaited in-process promise.
    expect(mocks.operationRequestLaunchCancel).toHaveBeenCalledWith(
      'launch-1',
      expect.stringContaining('dispatch failed'),
    );
    expect(mocks.operationSettleLaunch).toHaveBeenCalledWith('launch-1', 'failed');
  });

  it('J02 — an orphaned claim past its deadline is reconciled, never re-spawned', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    const stale = adoptedLaunch({ deadlineAt: new Date(Date.now() - 1000) });
    mocks.operationClaimLaunch.mockResolvedValue({ claimed: false, launch: stale });
    mocks.operationFindLaunchById.mockResolvedValue(stale);
    mocks.operationFindByJudgmentIntent.mockResolvedValue(null);

    const error = await runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        intentKey: 'ik-1',
        pollIntervalMs: 1,
        purpose: 'verify.judge',
      },
    }).catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'ACP_JUDGMENT_RUN_FAILED', intentKey: 'ik-1' });
    expect(mocks.execAgent).not.toHaveBeenCalled();
    expect(mocks.operationRequestLaunchCancel).toHaveBeenCalledWith(
      'launch-1',
      'launch deadline exceeded',
    );
    expect(mocks.operationSettleLaunch).toHaveBeenCalledWith('launch-1', 'failed');
    // Nothing landed — there is no writer to interrupt and no fabricated stop.
    expect(mocks.interruptTask).not.toHaveBeenCalled();
  });

  it('J02 — the cancel intent is durable even when the interrupt itself hangs', async () => {
    mocks.agentExistsById.mockResolvedValue(true);
    mocks.operationFindById.mockResolvedValue({ ...doneOperation, status: 'running' });
    // The cancel request hangs forever — the durable record is what survives.
    mocks.interruptTask.mockReturnValue(new Promise(() => {}));

    const promise = runAcpJudgment(db, 'u1', {
      input: JUDGMENT_INPUT,
      judgment: {
        binding: { agentId: 'agent-1' },
        intentKey: 'ik-1',
        pollIntervalMs: 1,
        purpose: 'verify.judge',
        timeoutMs: 5,
      },
    });
    promise.catch(() => {});

    // The launch row carries the cancel intent BEFORE the interrupt call —
    // a later same-intent reconcile finishes the job even if this process
    // never returns from interruptTask.
    await vi.waitFor(() => {
      expect(mocks.operationRequestLaunchCancel).toHaveBeenCalledWith(
        'launch-1',
        'wait budget exceeded',
      );
    });
    expect(mocks.interruptTask).toHaveBeenCalledWith({ operationId: 'op-1' });

    // The caller's promise cannot resolve while the physical stop is
    // unconfirmed — and the launch stays 'cancel_requested', recoverable.
    let settledOutcome = false;
    void promise.then(
      () => (settledOutcome = true),
      () => (settledOutcome = true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settledOutcome).toBe(false);
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

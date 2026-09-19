import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AcpBuiltinToolForbiddenError,
  AcpBuiltinToolNotFoundError,
  execAcpBuiltinTool,
} from '../acpBuiltinToolExec';

const { mockExecute, mockMemberRunner, mockRegisterWork, mockSubAgentRunner } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockMemberRunner: { run: vi.fn() },
  mockRegisterWork: vi.fn(),
  mockSubAgentRunner: { run: vi.fn() },
}));

vi.mock('@/server/services/toolExecution/builtin', () => ({
  BuiltinToolsExecutor: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

vi.mock('@/server/modules/AgentRuntime/executorHelpers', () => ({
  buildServerAgentMemberRunner: vi.fn().mockReturnValue(mockMemberRunner),
  buildServerVirtualSubAgentRunner: vi.fn().mockReturnValue(mockSubAgentRunner),
  registerWorkFromIntent: mockRegisterWork,
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@/database/models/chatGroup', () => ({
  ChatGroupModel: vi.fn().mockImplementation(function () {
    return { findById: vi.fn(), getGroupAgentsWithMeta: vi.fn().mockResolvedValue([]) };
  }),
}));

/** Chainable drizzle-ish mock: `.select().from().where().limit()` → rows. */
const chainTo = (rows: any[]) => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
  }),
});

const baseOp = {
  agentId: 'agt_1',
  appContext: { sourceMessageId: 'msg_user_1' },
  chatGroupId: null,
  id: 'op_1',
  metadata: {
    assistantMessageId: 'msg_asst_1',
    builtinTools: { 'orvilo-task': ['createTask'] },
  },
  modelRuntimeConfig: null,
  parentOperationId: null,
  status: 'running',
  taskId: 'task_1',
  threadId: null,
  topicId: 'topic_1',
  userId: 'user_1',
  workspaceId: 'ws_1',
};

const buildDeps = (overrides: { agentRow?: any; op?: any } = {}) => {
  const db = {
    select: vi
      .fn()
      // First select = operation row, second = agent row.
      .mockReturnValueOnce(chainTo([overrides.op ?? baseOp]))
      .mockReturnValue(
        chainTo(overrides.agentRow === null ? [] : [{ agencyConfig: {}, visibility: 'private' }]),
      ),
  };
  return {
    db: db as any,
    execGroupMember: vi.fn(),
    execSubAgent: vi.fn(),
    execVirtualSubAgent: vi.fn(),
    userId: 'user_1',
    workspaceId: 'ws_1',
  };
};

const baseInput = {
  apiName: 'createTask',
  args: { title: 'x' },
  identifier: 'orvilo-task',
  operationId: 'op_1',
  toolCallId: 'tc_1',
};

describe('execAcpBuiltinTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ content: 'done', success: true });
  });

  it('runs the builtin executor with a reconstructed context', async () => {
    const deps = buildDeps();
    const result = await execAcpBuiltinTool(deps, baseInput);

    expect(mockExecute).toHaveBeenCalledOnce();
    const [payload, ctx] = mockExecute.mock.calls[0];
    expect(payload).toEqual({
      apiName: 'createTask',
      arguments: JSON.stringify({ title: 'x' }),
      id: 'tc_1',
      identifier: 'orvilo-task',
      type: 'builtin',
    });
    expect(ctx).toMatchObject({
      agentId: 'agt_1',
      assistantMessageId: 'msg_asst_1',
      isSubAgent: false,
      messageId: 'msg_user_1',
      operationId: 'op_1',
      taskId: 'task_1',
      toolCallId: 'tc_1',
      topicId: 'topic_1',
      userId: 'user_1',
      workspaceId: 'ws_1',
    });
    expect(ctx.toolManifestMap['orvilo-task']).toBeDefined();
    expect(result).toEqual({ content: 'done', error: undefined, state: undefined, success: true });
  });

  it('rejects when the operation does not exist', async () => {
    const deps = buildDeps({ op: null });
    deps.db.select = vi.fn().mockReturnValue(chainTo([]));
    await expect(execAcpBuiltinTool(deps, baseInput)).rejects.toThrow(AcpBuiltinToolNotFoundError);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a tool outside the dispatch-time allowlist', async () => {
    const deps = buildDeps();
    await expect(execAcpBuiltinTool(deps, { ...baseInput, apiName: 'dropTable' })).rejects.toThrow(
      AcpBuiltinToolForbiddenError,
    );
    await expect(
      execAcpBuiltinTool(deps, { ...baseInput, identifier: 'orvilo-agent' }),
    ).rejects.toThrow(AcpBuiltinToolForbiddenError);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects when the op was dispatched without a tool surface', async () => {
    const deps = buildDeps({ op: { ...baseOp, metadata: {} } });
    await expect(execAcpBuiltinTool(deps, baseInput)).rejects.toThrow(AcpBuiltinToolForbiddenError);
  });

  it('marks child ops as isSubAgent (parentOperationId set)', async () => {
    const deps = buildDeps({ op: { ...baseOp, parentOperationId: 'op_parent' } });
    await execAcpBuiltinTool(deps, baseInput);
    expect(mockExecute.mock.calls[0][1].isSubAgent).toBe(true);
  });

  it('returns deferred + childOperationIds from forked runners', async () => {
    const execVirtualSubAgent = vi
      .fn()
      .mockResolvedValue({ operationId: 'op_child', success: true });
    mockExecute.mockResolvedValue({ deferred: true, success: true });
    const deps = { ...buildDeps(), execVirtualSubAgent };
    const result = await execAcpBuiltinTool(deps, baseInput);
    expect(result.deferred).toBe(true);
  });

  it('persists workRegistration intents via registerWorkFromIntent', async () => {
    mockExecute.mockResolvedValue({
      content: 'ok',
      success: true,
      workRegistration: { type: 'registerTask', taskId: 'task_1' },
    });
    const deps = buildDeps();
    await execAcpBuiltinTool(deps, baseInput);
    expect(mockRegisterWork).toHaveBeenCalledWith(
      expect.objectContaining({
        rootOperationId: 'op_1',
        sourceToolCallId: 'tc_1',
        sourceToolIdentifier: 'orvilo-task',
        userId: 'user_1',
      }),
    );
  });

  it('forwards runtime errors as success:false results', async () => {
    mockExecute.mockResolvedValue({
      error: { code: 'X', message: 'broke' },
      success: false,
    });
    const result = await execAcpBuiltinTool(buildDeps(), baseInput);
    expect(result).toEqual({
      content: undefined,
      error: { code: 'X', message: 'broke' },
      state: undefined,
      success: false,
    });
  });
});

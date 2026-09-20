import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AcpBuiltinToolForbiddenError,
  AcpBuiltinToolNotFoundError,
  awaitAcpBuiltinToolChildren,
  execAcpBuiltinTool,
} from '../acpBuiltinToolExec';

const {
  mockConnectorTools,
  mockExecute,
  mockExecuteTool,
  mockFindMessage,
  mockFindPlugin,
  mockMemberRunner,
  mockRegisterWork,
  mockResolveConnectors,
  mockSubAgentRunner,
  mockUpdateToolMessage,
  mockUpsertReceipt,
} = vi.hoisted(() => ({
  mockConnectorTools: vi.fn(),
  mockExecute: vi.fn(),
  mockExecuteTool: vi.fn(),
  mockFindMessage: vi.fn(),
  mockFindPlugin: vi.fn(),
  mockMemberRunner: { run: vi.fn() },
  mockRegisterWork: vi.fn(),
  mockResolveConnectors: vi.fn(),
  mockSubAgentRunner: { run: vi.fn() },
  mockUpdateToolMessage: vi.fn(),
  mockUpsertReceipt: vi.fn(),
}));

vi.mock('@/server/services/toolExecution/builtin', () => ({
  BuiltinToolsExecutor: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

vi.mock('@/server/services/toolExecution', () => ({
  ToolExecutionService: vi.fn().mockImplementation(function () {
    return { executeTool: mockExecuteTool };
  }),
}));

vi.mock('@/server/services/mcp', () => ({ mcpService: {} }));

vi.mock('@/server/services/connector/sync', () => ({
  buildConnectorMcpParams: vi.fn((connector: any) => ({
    auth: { token: connector.credentials?.token ?? 'none' },
    type: 'http',
    url: connector.mcpServerUrl,
  })),
}));

vi.mock('@/server/services/connector/tokens', () => ({
  ensureFreshConnectorToken: vi.fn(async (connector: any) => connector),
}));

vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn().mockImplementation(function () {
    return { resolveByIdentifiers: mockResolveConnectors };
  }),
}));

vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn().mockImplementation(function () {
    return { queryByConnector: mockConnectorTools };
  }),
}));

vi.mock('@/database/models/plugin', () => ({
  PluginModel: vi.fn().mockImplementation(function () {
    return { findById: mockFindPlugin };
  }),
}));

vi.mock('../orchestrationRunners', () => ({
  buildServerAgentMemberRunner: vi.fn().mockReturnValue(mockMemberRunner),
  buildServerVirtualSubAgentRunner: vi.fn().mockReturnValue(mockSubAgentRunner),
  registerWorkFromIntent: mockRegisterWork,
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn().mockImplementation(function () {
    return { findById: mockFindMessage, updateToolMessage: mockUpdateToolMessage };
  }),
}));

vi.mock('@/database/models/eventOutbox', () => ({
  EventOutboxModel: vi.fn().mockImplementation(function () {
    return { upsertDeliveryReceipt: mockUpsertReceipt };
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

  describe('external connector / plugin tools', () => {
    const externalOp = {
      ...baseOp,
      metadata: {
        ...baseOp.metadata,
        externalTools: { 'my-conn': { apis: ['do_thing'], source: 'connector' } },
      },
    };
    const externalInput = { ...baseInput, apiName: 'do_thing', identifier: 'my-conn' };

    beforeEach(() => {
      mockResolveConnectors.mockResolvedValue([
        {
          credentials: { token: 'tok' },
          id: 'conn_row_1',
          isEnabled: true,
          mcpServerUrl: 'https://mcp.example.com',
        },
      ]);
      mockConnectorTools.mockResolvedValue([
        {
          description: 'Do a thing',
          inputSchema: { type: 'object' },
          permission: 'auto',
          toolName: 'do_thing',
        },
      ]);
      mockExecuteTool.mockResolvedValue({ content: 'external done', success: true });
    });

    it('executes a connector tool through the MCP path with fresh credentials', async () => {
      const result = await execAcpBuiltinTool(buildDeps({ op: externalOp }), externalInput);

      expect(mockResolveConnectors).toHaveBeenCalledWith(['my-conn'], 'agt_1');
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockExecuteTool).toHaveBeenCalledOnce();
      const [payload, ctx] = mockExecuteTool.mock.calls[0];
      expect(payload.type).toBe('mcp');
      expect(payload.identifier).toBe('my-conn');
      expect(ctx.toolManifestMap['my-conn'].mcpParams).toEqual({
        auth: { token: 'tok' },
        type: 'http',
        url: 'https://mcp.example.com',
      });
      expect(result).toMatchObject({ content: 'external done', success: true });
    });

    it('rejects a disabled connector at call time, not dispatch time', async () => {
      mockResolveConnectors.mockResolvedValue([{ id: 'conn_row_1', isEnabled: false }]);
      await expect(
        execAcpBuiltinTool(buildDeps({ op: externalOp }), externalInput),
      ).rejects.toThrow(AcpBuiltinToolForbiddenError);
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    it('rejects a connector tool name that is no longer synced', async () => {
      mockConnectorTools.mockResolvedValue([]);
      await expect(
        execAcpBuiltinTool(buildDeps({ op: externalOp }), externalInput),
      ).rejects.toThrow(AcpBuiltinToolNotFoundError);
      expect(mockExecuteTool).not.toHaveBeenCalled();
    });

    it('rejects an external api outside the dispatch-time mount', async () => {
      await expect(
        execAcpBuiltinTool(buildDeps({ op: externalOp }), {
          ...externalInput,
          apiName: 'dropTable',
        }),
      ).rejects.toThrow(AcpBuiltinToolForbiddenError);
      expect(mockResolveConnectors).not.toHaveBeenCalled();
    });

    it('executes an installed MCP plugin via its customParams.mcp transport', async () => {
      const op = {
        ...baseOp,
        metadata: {
          ...baseOp.metadata,
          externalTools: { 'my-plugin': { apis: ['query'], source: 'mcp-plugin' } },
        },
      };
      mockFindPlugin.mockResolvedValue({
        customParams: { mcp: { command: 'npx', args: ['my-mcp'], type: 'stdio' } },
        manifest: {
          api: [{ name: 'query', parameters: {} }],
          identifier: 'my-plugin',
        },
      });
      const result = await execAcpBuiltinTool(buildDeps({ op }), {
        ...baseInput,
        apiName: 'query',
        identifier: 'my-plugin',
      });
      const [payload, ctx] = mockExecuteTool.mock.calls[0];
      expect(payload.type).toBe('mcp');
      expect(ctx.toolManifestMap['my-plugin'].mcpParams).toEqual({
        args: ['my-mcp'],
        command: 'npx',
        type: 'stdio',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an mcp-plugin that lost its transport config', async () => {
      const op = {
        ...baseOp,
        metadata: {
          ...baseOp.metadata,
          externalTools: { 'my-plugin': { apis: ['query'], source: 'mcp-plugin' } },
        },
      };
      mockFindPlugin.mockResolvedValue({
        customParams: {},
        manifest: { api: [{ name: 'query', parameters: {} }] },
      });
      await expect(
        execAcpBuiltinTool(buildDeps({ op }), {
          ...baseInput,
          apiName: 'query',
          identifier: 'my-plugin',
        }),
      ).rejects.toThrow(AcpBuiltinToolNotFoundError);
    });
  });
});

/**
 * `awaitAcpBuiltinToolChildren` — the long-poll the `orvilo_cc` MCP server
 * drives for deferred orchestration calls (sub-agents / group members).
 */
describe('awaitAcpBuiltinToolChildren', () => {
  const awaitDb = ({
    children,
    parent,
    plugins,
  }: {
    children: any[];
    parent?: any;
    plugins?: any[];
  }) => ({
    select: vi.fn().mockImplementation((cols: any) => {
      const rows =
        'toolCallId' in cols ? (plugins ?? []) : 'appContext' in cols ? [parent ?? {}] : children;
      // Thenable with `.limit` so both `.where()` (awaited) and
      // `.where().limit()` chains resolve to the same rows.
      const resolved: any = Promise.resolve(rows);
      resolved.limit = () => Promise.resolve(rows);
      return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(resolved) }) };
    }),
  });

  const deps = { userId: 'user_1', workspaceId: 'ws_1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateToolMessage.mockResolvedValue({ success: true });
    mockUpsertReceipt.mockResolvedValue('delivered');
  });

  it('keeps a waiting_for_human child pending instead of settling the parent', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'waiting_for_human' }],
    });
    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      { childOperationIds: ['op_c1'], operationId: 'op_1', timeoutMs: 1 },
    );
    expect(result).toEqual({ pendingOperationIds: ['op_c1'], status: 'pending' });
  });

  it('keeps an idle (dispatched, not started) child pending', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'idle' }],
    });
    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      { childOperationIds: ['op_c1'], operationId: 'op_1', timeoutMs: 1 },
    );
    expect(result.status).toBe('pending');
  });

  it('settles only when every child is terminal and sweeps only owned placeholders', async () => {
    const plugins = [
      // Owned by this call — pending, must be swept.
      { id: 'msg_own', state: { status: 'pending' }, toolCallId: 'tc_9' },
      // Member anchor of this call — pending, must be swept.
      { id: 'msg_member', state: { status: 'pending' }, toolCallId: 'tc_9::m2' },
      // Prefix-sharing row owned by a DIFFERENT call — must never be touched.
      { id: 'msg_foreign', state: { status: 'pending' }, toolCallId: 'tc_9extra' },
      // Owned but already terminal — left alone.
      { id: 'msg_done', state: { status: 'completed' }, toolCallId: 'tc_9::m1' },
    ];
    const db = awaitDb({
      children: [
        { error: null, id: 'op_c1', metadata: { assistantMessageId: 'm_a' }, status: 'done' },
      ],
      parent: { appContext: { executionGeneration: 3 }, workspaceId: 'ws_1' },
      plugins,
    });
    mockFindMessage.mockResolvedValue({ content: 'child answer' });

    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      { childOperationIds: ['op_c1'], operationId: 'op_1', timeoutMs: 1, toolCallId: 'tc_9' },
    );

    expect(result.status).toBe('settled');
    expect(result).toMatchObject({
      results: [{ content: 'child answer', operationId: 'op_c1', status: 'done' }],
    });
    const sweptIds = mockUpdateToolMessage.mock.calls.map((c) => c[0]);
    expect(sweptIds).toEqual(['msg_own', 'msg_member']);
    // Delivery ledger: one receipt per child, marked delivered (consumed).
    expect(mockUpsertReceipt).toHaveBeenCalledOnce();
    expect(mockUpsertReceipt.mock.calls[0][0]).toMatchObject({
      delivered: true,
      event: {
        eventId: 'child-result:op_1:op_c1:tc_9:3',
        eventType: 'agent_operation.child_result',
      },
    });
  });

  it('returns timeout and settles owned placeholders to error past the wait deadline', async () => {
    const stale = Date.now() - 10 * 60_000;
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      plugins: [
        {
          id: 'msg_own',
          state: { awaitStartedAt: stale, status: 'pending' },
          toolCallId: 'tc_9',
        },
      ],
    });

    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
        waitDeadlineMs: 60_000,
      },
    );

    expect(result).toEqual({ pendingOperationIds: ['op_c1'], status: 'timeout' });
    expect(mockUpdateToolMessage).toHaveBeenCalledWith('msg_own', {
      content: expect.stringContaining('op_c1'),
      pluginState: { status: 'error', waitDeadlineExceeded: true },
    });
  });

  it('stamps awaitStartedAt on first contact inside the deadline', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      plugins: [{ id: 'msg_own', state: { status: 'pending' }, toolCallId: 'tc_9' }],
    });

    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
        waitDeadlineMs: 60_000,
      },
    );

    expect(result.status).toBe('pending');
    expect(mockUpdateToolMessage).toHaveBeenCalledWith('msg_own', {
      pluginState: { awaitStartedAt: expect.any(Number) },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecryptedConnector } from '@/database/models/connector';

import {
  ackAcpChildResultDeliveries,
  AcpBuiltinToolForbiddenError,
  AcpBuiltinToolNotFoundError,
  awaitAcpBuiltinToolChildren,
  execAcpBuiltinTool,
} from '../acpBuiltinToolExec';
import { connectorAuthRevision } from '../pipeline/externalToolPins';

const {
  mockAckReceipt,
  mockConnectorTools,
  mockConsumeApprovalReceipt,
  mockExecute,
  mockExecuteTool,
  mockFindConnectorById,
  mockFindMessage,
  mockFindPlugin,
  mockGetReceiptPayload,
  mockMemberRunner,
  mockOfferReceipt,
  mockRecordApprovalDecision,
  mockRegisterWork,
  mockRenewApprovalReceipt,
  mockResolveConnectors,
  mockSubAgentRunner,
  mockUpdateToolMessage,
  mockUpsertReceipt,
} = vi.hoisted(() => ({
  mockAckReceipt: vi.fn(),
  mockConnectorTools: vi.fn(),
  mockConsumeApprovalReceipt: vi.fn(),
  mockExecute: vi.fn(),
  mockExecuteTool: vi.fn(),
  mockFindConnectorById: vi.fn(),
  mockFindMessage: vi.fn(),
  mockFindPlugin: vi.fn(),
  mockGetReceiptPayload: vi.fn(),
  mockMemberRunner: { run: vi.fn() },
  mockOfferReceipt: vi.fn(),
  mockRecordApprovalDecision: vi.fn(),
  mockRegisterWork: vi.fn(),
  mockRenewApprovalReceipt: vi.fn(),
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
    return { findById: mockFindConnectorById, resolveByIdentifiers: mockResolveConnectors };
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
    return {
      ackDeliveryReceiptByEventId: mockAckReceipt,
      consumeToolApprovalReceipt: mockConsumeApprovalReceipt,
      getDeliveryReceiptPayload: mockGetReceiptPayload,
      offerDeliveryReceiptByEventId: mockOfferReceipt,
      recordToolApprovalDecision: mockRecordApprovalDecision,
      renewToolApprovalReceipt: mockRenewApprovalReceipt,
      upsertDeliveryReceipt: mockUpsertReceipt,
    };
  }),
  newEventId: () => 'evt_test',
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
          identifier: 'my-conn',
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

    describe('connector identity pinning (C03)', () => {
      const pinnedConnector = {
        credentials: { token: 'tok' },
        id: 'conn_row_1',
        identifier: 'my-conn',
        isEnabled: true,
        mcpServerUrl: 'https://mcp.example.com',
      } as unknown as DecryptedConnector;
      const pinnedOp = (pins: Record<string, unknown>) => ({
        ...baseOp,
        metadata: {
          ...baseOp.metadata,
          externalTools: { 'my-conn': { apis: ['do_thing'], pins, source: 'connector' } },
        },
      });

      it('re-authorizes the pinned connection, never a same-identifier substitute', async () => {
        // Another row claims the identifier now; the pin must still load
        // `conn_row_1` — `resolveByIdentifiers` must not run at all.
        mockFindConnectorById.mockResolvedValue(pinnedConnector);
        mockResolveConnectors.mockResolvedValue([{ id: 'conn_row_2', identifier: 'my-conn' }]);

        const result = await execAcpBuiltinTool(
          buildDeps({
            op: pinnedOp({
              authRevision: connectorAuthRevision(pinnedConnector),
              connectorId: 'conn_row_1',
            }),
          }),
          externalInput,
        );

        expect(mockFindConnectorById).toHaveBeenCalledWith('conn_row_1');
        expect(mockResolveConnectors).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(mockExecuteTool).toHaveBeenCalledOnce();
      });

      it('refuses when the pinned connector is disabled — no re-identity', async () => {
        mockFindConnectorById.mockResolvedValue({ ...pinnedConnector, isEnabled: false });
        mockResolveConnectors.mockResolvedValue([
          { ...pinnedConnector, id: 'conn_row_2', isEnabled: true },
        ]);

        await expect(
          execAcpBuiltinTool(
            buildDeps({ op: pinnedOp({ connectorId: 'conn_row_1' }) }),
            externalInput,
          ),
        ).rejects.toThrow(AcpBuiltinToolForbiddenError);
        expect(mockResolveConnectors).not.toHaveBeenCalled();
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('refuses a re-authorized connection (authRevision mismatch)', async () => {
        mockFindConnectorById.mockResolvedValue(pinnedConnector);

        await expect(
          execAcpBuiltinTool(
            buildDeps({ op: pinnedOp({ authRevision: 'stale-rev', connectorId: 'conn_row_1' }) }),
            externalInput,
          ),
        ).rejects.toThrow(/re-authorized since dispatch/);
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('refuses when the pinned row no longer carries the identifier', async () => {
        mockFindConnectorById.mockResolvedValue({ ...pinnedConnector, identifier: 'other-conn' });

        await expect(
          execAcpBuiltinTool(
            buildDeps({ op: pinnedOp({ connectorId: 'conn_row_1' }) }),
            externalInput,
          ),
        ).rejects.toThrow(AcpBuiltinToolForbiddenError);
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('refuses a per-api schema change since dispatch', async () => {
        mockFindConnectorById.mockResolvedValue(pinnedConnector);

        await expect(
          execAcpBuiltinTool(
            buildDeps({
              op: pinnedOp({
                connectorId: 'conn_row_1',
                schemaDigests: { do_thing: 'old-digest' },
              }),
            }),
            externalInput,
          ),
        ).rejects.toThrow(/schema changed since dispatch/);
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('refuses a substituted plugin install (pluginInstallId pin)', async () => {
        const op = {
          ...baseOp,
          metadata: {
            ...baseOp.metadata,
            externalTools: {
              'my-plugin': {
                apis: ['query'],
                pins: { pluginInstallId: 'install_1' },
                source: 'mcp-plugin',
              },
            },
          },
        };
        mockFindPlugin.mockResolvedValue({
          customParams: { mcp: { command: 'npx', args: [], type: 'stdio' } },
          id: 'install_2',
          manifest: { api: [{ name: 'query', parameters: {} }], identifier: 'my-plugin' },
        });

        await expect(
          execAcpBuiltinTool(buildDeps({ op }), {
            ...baseInput,
            apiName: 'query',
            identifier: 'my-plugin',
          }),
        ).rejects.toThrow(/reinstalled since dispatch/);
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });
    });

    describe('needs_approval receipt gate (C01/C02)', () => {
      const needsApprovalTool = {
        description: 'Do a thing',
        inputSchema: { type: 'object' },
        permission: 'needs_approval',
        toolName: 'do_thing',
      };
      const approvalOp = (overrides: Record<string, unknown> = {}) => ({
        ...baseOp,
        appContext: { ...baseOp.appContext, executionGeneration: 1, ...overrides },
        metadata: {
          ...baseOp.metadata,
          externalTools: { 'my-conn': { apis: ['do_thing'], source: 'connector' } },
        },
      });

      beforeEach(() => {
        mockConnectorTools.mockResolvedValue([needsApprovalTool]);
        mockConsumeApprovalReceipt.mockResolvedValue(false);
        mockGetReceiptPayload.mockResolvedValue(undefined);
        mockUpsertReceipt.mockResolvedValue(undefined);
        mockRenewApprovalReceipt.mockResolvedValue(false);
      });

      it('C01: creates a pending receipt and refuses — zero mcp.callTool', async () => {
        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);

        // Receipt persisted (dedupe-stable upsert), read-back classified as
        // pending — the call refused BEFORE the MCP transport ran.
        expect(mockUpsertReceipt).toHaveBeenCalledOnce();
        expect(mockUpsertReceipt.mock.calls[0][0].event.eventType).toBe(
          'agent_operation.tool_approval',
        );
        expect(result).toMatchObject({
          error: { code: 'acp_tool_approval_pending' },
          success: false,
        });
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('C02: a valid approved receipt consumes once and executes', async () => {
        mockConsumeApprovalReceipt.mockResolvedValue(true);

        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);

        expect(mockConsumeApprovalReceipt).toHaveBeenCalledWith(
          expect.objectContaining({ eventId: 'tool-approval:op_1:tc_1' }),
        );
        expect(mockExecuteTool).toHaveBeenCalledOnce();
        expect(result.success).toBe(true);
      });

      it('C02: a denied decision refuses with approval_denied', async () => {
        mockGetReceiptPayload.mockResolvedValue({
          argsHash: 'x',
          decision: { action: 'denied' },
          expiresAt: Date.now() + 60_000,
        });

        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);
        expect(result.error?.code).toBe('acp_tool_approval_denied');
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('C02: an expired undecided receipt renews once and re-pends', async () => {
        mockGetReceiptPayload.mockResolvedValue({ expiresAt: Date.now() - 1 });
        mockRenewApprovalReceipt.mockResolvedValue(true);

        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);
        expect(mockRenewApprovalReceipt).toHaveBeenCalledOnce();
        expect(result.error?.code).toBe('acp_tool_approval_pending');
        expect(result.state?.toolApproval).toMatchObject({ renewed: true });
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('C02: an already-consumed approval cannot replay', async () => {
        mockGetReceiptPayload.mockResolvedValue({
          consumedAt: Date.now() - 1000,
          decision: { action: 'approved' },
          expiresAt: Date.now() + 60_000,
        });

        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);
        expect(result.error?.code).toBe('acp_tool_approval_consumed');
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('C02: an approved receipt bound to different args refuses as mismatch', async () => {
        // Consume CAS lost (argsHash mismatch server-side); the read-back is
        // still classified approved — the payload argsHash check must refuse.
        mockGetReceiptPayload.mockResolvedValue({
          argsHash: 'different-args',
          decision: { action: 'approved' },
          expiresAt: Date.now() + 60_000,
        });

        const result = await execAcpBuiltinTool(buildDeps({ op: approvalOp() }), externalInput);
        expect(result.error?.code).toBe('acp_tool_approval_args_mismatch');
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });

      it('C02: headless runs refuse outright — never auto-approve', async () => {
        const result = await execAcpBuiltinTool(
          buildDeps({ op: approvalOp({ interventionApprovalMode: 'headless' }) }),
          externalInput,
        );

        expect(result.error?.code).toBe('acp_tool_approval_unavailable');
        // No receipt is minted for a run that cannot ask — and no side effects.
        expect(mockUpsertReceipt).not.toHaveBeenCalled();
        expect(mockExecuteTool).not.toHaveBeenCalled();
      });
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
      // `.where().limit()` chains resolve to the same rows. `innerJoin`
      // mirrors the placeholder query (`messagePlugins ⨝ messages`).
      const resolved: any = Promise.resolve(rows);
      resolved.limit = () => Promise.resolve(rows);
      const whereResult = resolved;
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(whereResult) }),
          where: vi.fn().mockReturnValue(whereResult),
        }),
      };
    }),
  });

  const deps = { userId: 'user_1', workspaceId: 'ws_1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateToolMessage.mockResolvedValue({ success: true });
    mockUpsertReceipt.mockResolvedValue('delivered');
    mockOfferReceipt.mockResolvedValue(true);
    mockAckReceipt.mockResolvedValue(true);
    mockGetReceiptPayload.mockResolvedValue(undefined);
  });

  it('keeps a waiting_for_human child pending instead of settling the parent', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'waiting_for_human' }],
    });
    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      { childOperationIds: ['op_c1'], operationId: 'op_1', timeoutMs: 1 },
    );
    expect(result).toEqual({
      contractVersion: 1,
      pendingOperationIds: ['op_c1'],
      status: 'pending',
    });
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

  it('D01: idle / approval-wait / async-wait / unknown children all stay pending', async () => {
    for (const status of ['idle', 'waiting_for_human', 'waiting_for_async_tool']) {
      const db = awaitDb({
        children: [{ error: null, id: 'op_c1', metadata: {}, status }],
      });
      const result = await awaitAcpBuiltinToolChildren(
        { ...deps, db: db as any },
        { childOperationIds: ['op_c1'], operationId: 'op_1', timeoutMs: 1 },
      );
      expect(result.status).toBe('pending');
      expect(mockUpsertReceipt).not.toHaveBeenCalled();
    }
    // Unknown child — the row does not exist yet; never an early settle.
    const db = awaitDb({ children: [] });
    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      { childOperationIds: ['op_unknown'], operationId: 'op_1', timeoutMs: 1 },
    );
    expect(result).toMatchObject({ pendingOperationIds: ['op_unknown'], status: 'pending' });
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
    // The stamped `awaitDeadlineAt` is already past — this poll observes the
    // expired absolute deadline.
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      plugins: [
        {
          id: 'msg_own',
          state: {
            awaitDeadlineAt: Date.now() - 1,
            awaitStartedAt: Date.now() - 30 * 60_000,
            status: 'pending',
          },
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
        waitDeadlineMs: 5_000,
      },
    );

    expect(result).toMatchObject({ pendingOperationIds: ['op_c1'], status: 'timeout' });
    expect(mockUpdateToolMessage).toHaveBeenCalledWith('msg_own', {
      content: expect.stringContaining('op_c1'),
      pluginState: { status: 'error', waitDeadlineExceeded: true },
    });
  });

  it('stamps a fixed awaitDeadlineAt + owner on first contact inside the deadline', async () => {
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
      pluginState: {
        awaitDeadlineAt: expect.any(Number),
        awaitOwnerOperationId: 'op_1',
        awaitStartedAt: expect.any(Number),
      },
    });
  });

  it('D04: a shrinking remaining budget cannot timeout before the fixed deadline', async () => {
    // 30-min budget, polled at t=15min: remaining=15min. The old code compared
    // elapsed(15min) >= remaining(15min) → fired ~halfway. The stamped
    // `awaitDeadlineAt` is absolute — this poll is still inside it.
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      plugins: [
        {
          id: 'msg_own',
          state: {
            awaitDeadlineAt: Date.now() + 15 * 60_000,
            awaitStartedAt: Date.now() - 15 * 60_000,
            status: 'pending',
          },
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
        // The host's remaining budget — well past the old bug's firing point.
        waitDeadlineMs: 15 * 60_000,
      },
    );

    expect(result.status).toBe('pending');
    expect(
      mockUpdateToolMessage.mock.calls.some(
        (c) => c[1]?.pluginState?.waitDeadlineExceeded === true,
      ),
    ).toBe(false);
  });

  it('D04: a missing anchor still persists one fixed deadline', async () => {
    // No placeholder rows exist (await raced exec) — the deadline lives on a
    // keyed outbox receipt so reconnects share one instant.
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      plugins: [],
    });

    const first = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
        waitDeadlineMs: 30 * 60_000,
      },
    );
    expect(first.status).toBe('pending');
    const anchorCall = mockUpsertReceipt.mock.calls.find(
      (c) => c[0].event.eventType === 'agent_operation.await_deadline',
    );
    expect(anchorCall?.[0].event.eventId).toBe('await-anchor:op_1:tc_9');
    expect(anchorCall?.[0].event.payload.awaitDeadlineAt).toEqual(expect.any(Number));

    // A later poll reuses the persisted deadline — never restamps.
    mockGetReceiptPayload.mockResolvedValue({
      awaitDeadlineAt: anchorCall![0].event.payload.awaitDeadlineAt,
    });
    const second = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
        waitDeadlineMs: 5 * 60_000,
      },
    );
    expect(second.status).toBe('pending');
    // One anchor upsert total — no second stamp.
    expect(
      mockUpsertReceipt.mock.calls.filter(
        (c) => c[0].event.eventType === 'agent_operation.await_deadline',
      ),
    ).toHaveLength(1);

    // Poll past the persisted instant → timeout even with no anchor rows.
    mockGetReceiptPayload.mockResolvedValue({ awaitDeadlineAt: Date.now() - 1 });
    const third = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
        waitDeadlineMs: 30 * 60_000,
      },
    );
    expect(third.status).toBe('timeout');
  });

  it('D02: v2 settle offers deliveries; only the parent ack consumes them', async () => {
    const db = awaitDb({
      children: [
        { error: null, id: 'op_c1', metadata: { assistantMessageId: 'm_a' }, status: 'done' },
      ],
      parent: { appContext: { executionGeneration: 3 }, workspaceId: 'ws_1' },
      plugins: [],
    });
    mockFindMessage.mockResolvedValue({ content: 'child answer' });

    const result = await awaitAcpBuiltinToolChildren(
      { ...deps, db: db as any },
      {
        childOperationIds: ['op_c1'],
        contractVersion: 2,
        operationId: 'op_1',
        timeoutMs: 1,
        toolCallId: 'tc_9',
      },
    );

    expect(result).toMatchObject({ contractVersion: 2, status: 'settled' });
    const eventId = 'child-result:op_1:op_c1:tc_9:3';
    expect(result).toMatchObject({
      deliveries: [{ childOperationId: 'op_c1', deliveryState: 'offered', eventId }],
    });
    // The receipt is written `received` then CAS-offered — never delivered.
    expect(mockUpsertReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          eventId,
          nextAttemptAt: expect.any(Date),
          payload: expect.objectContaining({ deliveryState: 'received' }),
        }),
      }),
    );
    expect(mockOfferReceipt).toHaveBeenCalledWith(eventId);
    expect(mockUpsertReceipt.mock.calls[0][0].delivered).toBeUndefined();

    // Parent-side durable consume — the only transition to `acked`.
    const ack = await ackAcpChildResultDeliveries(
      { db: db as any },
      { deliveryEventIds: [eventId], operationId: 'op_1' },
    );
    expect(mockAckReceipt).toHaveBeenCalledWith({ aggregateId: 'op_1', eventId });
    expect(ack).toEqual({ acked: [eventId], ignored: [] });
  });

  it('D02: a v2 settle replay re-offers idempotently (acked/superseded untouched)', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'done' }],
    });
    const input = {
      childOperationIds: ['op_c1'],
      contractVersion: 2 as const,
      operationId: 'op_1',
      timeoutMs: 1,
      toolCallId: 'tc_9',
    };

    // Simulate a lost HTTP response: the parent polls again — same event id,
    // `offer` CAS is a no-op on an already-offered/acked row but must run.
    await awaitAcpBuiltinToolChildren({ ...deps, db: db as any }, input);
    await awaitAcpBuiltinToolChildren({ ...deps, db: db as any }, input);
    expect(mockOfferReceipt).toHaveBeenCalledTimes(2);
    expect(mockAckReceipt).not.toHaveBeenCalled();
  });

  it('D03: an outbox write failure fails the settle — not a success response', async () => {
    mockUpsertReceipt.mockRejectedValue(new Error('event_outbox: disk full'));
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'done' }],
    });

    await expect(
      awaitAcpBuiltinToolChildren(
        { ...deps, db: db as any },
        {
          childOperationIds: ['op_c1'],
          contractVersion: 2,
          operationId: 'op_1',
          timeoutMs: 1,
          toolCallId: 'tc_9',
        },
      ),
    ).rejects.toThrow('disk full');
  });

  it('D06: a same-toolCallId placeholder owned by another operation is never swept or claimed', async () => {
    const plugins = [
      // Another operation's placeholder — same user, same toolCallId,
      // different topic → invisible to this op's sweep.
      {
        id: 'msg_foreign',
        messageTopicId: 'topic_other',
        ownerOperationId: 'op_other',
        state: { status: 'pending' },
        toolCallId: 'tc_9',
      },
    ];
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      parent: { appContext: {}, topicId: 'topic_1', workspaceId: 'ws_1' },
      plugins,
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
    expect(mockUpdateToolMessage).not.toHaveBeenCalled();
  });

  it('D06: placeholders in another topic are not stamped even unowned', async () => {
    const db = awaitDb({
      children: [{ error: null, id: 'op_c1', metadata: {}, status: 'running' }],
      parent: { appContext: {}, topicId: 'topic_1', workspaceId: 'ws_1' },
      plugins: [
        {
          id: 'msg_foreign',
          messageTopicId: 'topic_other',
          ownerOperationId: null,
          state: { status: 'pending' },
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

    // The foreign-topic row is not ours → no stamp; the missing-anchor
    // receipt still bounds the wait so it cannot pend forever.
    expect(result.status).toBe('pending');
    expect(mockUpdateToolMessage).not.toHaveBeenCalled();
    expect(mockUpsertReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ eventType: 'agent_operation.await_deadline' }),
      }),
    );
  });
});

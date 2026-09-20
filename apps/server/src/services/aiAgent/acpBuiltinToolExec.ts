import { builtinTools } from '@orvilo/builtin-tools';
import type { OrviloToolManifest } from '@orvilo/context-engine';
import type {
  ChatToolPayload,
  ExecSubAgentParams,
  ExecSubAgentResult,
  ExecVirtualSubAgentParams,
} from '@orvilo/types';
import { isTerminalAgentOperationStatus } from '@orvilo/types';
import debug from 'debug';
import { and, eq, inArray, like } from 'drizzle-orm';

import { ChatGroupModel } from '@/database/models/chatGroup';
import { ConnectorModel } from '@/database/models/connector';
import { ConnectorToolModel } from '@/database/models/connectorTool';
import { EventOutboxModel } from '@/database/models/eventOutbox';
import { MessageModel } from '@/database/models/message';
import { PluginModel } from '@/database/models/plugin';
import {
  agentOperations,
  agents,
  ConnectorToolPermission,
  messagePlugins,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import type {
  ExecGroupMemberParams,
  ExecGroupMemberResult,
} from '@/server/services/agentExecution/types';
import { buildConnectorMcpParams } from '@/server/services/connector/sync';
import { ensureFreshConnectorToken } from '@/server/services/connector/tokens';
import { mcpService } from '@/server/services/mcp';
import { ToolExecutionService } from '@/server/services/toolExecution';
import { BuiltinToolsExecutor } from '@/server/services/toolExecution/builtin';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from '@/server/services/toolExecution/types';

import {
  CHILD_RESULT_EVENT_TYPE,
  childResultEventId,
  isOwnedToolCallId,
} from '../agentExecution/childResultDelivery';
import { buildGroupAgentContext } from './helpers/groupContext';
import {
  buildServerAgentMemberRunner,
  buildServerVirtualSubAgentRunner,
  type OrchestrationRunnerContext,
  type OrchestrationRunnerState,
  registerWorkFromIntent,
} from './orchestrationRunners';

const log = debug('orvilo-server:ai-agent:acp-builtin-tool');

/**
 * Server-backed builtin tool execution for ACP runs (P70c).
 *
 * Under ACP the agent harness owns its tool loop on the execution host
 * (desktop / connected device / cloud sandbox). Orvilo builtin tools that
 * still need the server — verify writeback, brief, memory, orchestration —
 * are mounted on the host's per-run `orvilo_cc` MCP server and call back
 * here through `execBuiltinTool`. This module rebuilds the
 * `ToolExecutionContext` the retired in-process loop supplied, enforces the
 * dispatch-time allowlist persisted on `agent_operations.metadata.builtinTools`,
 * and runs the call through the shared `BuiltinToolsExecutor` so every
 * `serverRuntimes` implementation behaves identically to the old loop.
 */

export interface AcpBuiltinToolExecDeps {
  db: OrviloDatabase;
  /**
   * Orchestration delegates. Bound `AiAgentService` arrow fields — passed as
   * callbacks so this module never imports the service it is called from.
   */
  execGroupMember: (params: ExecGroupMemberParams) => Promise<ExecGroupMemberResult>;
  execSubAgent: (params: ExecSubAgentParams) => Promise<ExecSubAgentResult>;
  execVirtualSubAgent: (params: ExecVirtualSubAgentParams) => Promise<ExecSubAgentResult>;
  userId: string;
  workspaceId?: string;
}

export interface AcpBuiltinToolExecInput {
  apiName: string;
  args: Record<string, unknown>;
  identifier: string;
  operationId: string;
  /** CLI-generated id stamped on placeholder rows (`tool_call_id`). */
  toolCallId: string;
}

export interface AcpBuiltinToolExecResult {
  /** Child ops forked by a deferred runtime (sub-agent / group members). */
  childOperationIds?: string[];
  content?: string;
  deferred?: boolean;
  error?: { code?: string; message: string };
  state?: Record<string, unknown>;
  success: boolean;
}

type OperationRow = {
  agentId: string | null;
  appContext: Record<string, unknown> | null;
  chatGroupId: string | null;
  id: string;
  metadata: Record<string, any> | null;
  modelRuntimeConfig: Record<string, any> | null;
  parentOperationId: string | null;
  status: string;
  taskId: string | null;
  threadId: string | null;
  topicId: string | null;
  userId: string;
  workspaceId: string | null;
};

export class AcpBuiltinToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcpBuiltinToolNotFoundError';
  }
}

export class AcpBuiltinToolForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcpBuiltinToolForbiddenError';
  }
}

/** Load the op row; the caller's JWT already bound the token to this op id. */
export const loadAcpToolOperation = async (
  db: OrviloDatabase,
  operationId: string,
): Promise<OperationRow> => {
  const [operation] = await db
    .select({
      agentId: agentOperations.agentId,
      appContext: agentOperations.appContext,
      chatGroupId: agentOperations.chatGroupId,
      id: agentOperations.id,
      metadata: agentOperations.metadata,
      modelRuntimeConfig: agentOperations.modelRuntimeConfig,
      parentOperationId: agentOperations.parentOperationId,
      status: agentOperations.status,
      taskId: agentOperations.taskId,
      threadId: agentOperations.threadId,
      topicId: agentOperations.topicId,
      userId: agentOperations.userId,
      workspaceId: agentOperations.workspaceId,
    })
    .from(agentOperations)
    .where(eq(agentOperations.id, operationId))
    .limit(1);
  if (!operation) throw new AcpBuiltinToolNotFoundError('Operation not found');
  return operation as OperationRow;
};

/**
 * External (connector / installed-plugin MCP) mount persisted at dispatch on
 * `metadata.externalTools` — api names + source only, never transport params
 * or credentials. The exec callback re-resolves the connection at call time.
 */
interface ExternalToolMountMetadata {
  apis: string[];
  source: 'connector' | 'mcp-plugin';
}

const readExternalMounts = (
  operation: OperationRow,
): Record<string, ExternalToolMountMetadata> | undefined =>
  operation.metadata?.externalTools as Record<string, ExternalToolMountMetadata> | undefined;

/**
 * Check `identifier:apiName` against the run's dispatch-time allowlist — the
 * union of `metadata.builtinTools` and `metadata.externalTools` api names. The
 * allowlist — not the caller's claim — decides what is invocable, so a stolen
 * or replayed operation token cannot reach a runtime the tool-surface resolver
 * never mounted.
 */
const resolveToolAllowlist = (
  operation: OperationRow,
  identifier: string,
  apiName: string,
): Record<string, string[]> => {
  const builtinAllowlist = operation.metadata?.builtinTools as Record<string, string[]> | undefined;
  const externalMount = readExternalMounts(operation)?.[identifier];
  if (!builtinAllowlist && !externalMount) {
    throw new AcpBuiltinToolForbiddenError(
      'This operation was dispatched without a builtin tool surface',
    );
  }
  const apiNames = builtinAllowlist?.[identifier] ?? externalMount?.apis;
  if (!apiNames?.includes(apiName)) {
    throw new AcpBuiltinToolForbiddenError(
      `Tool ${identifier}:${apiName} is not part of this run's tool surface`,
    );
  }
  return builtinAllowlist ?? {};
};

/**
 * Execute one builtin tool call on behalf of a running ACP operation.
 * Returns the runtime's result verbatim plus `childOperationIds` when the
 * runtime deferred (the caller polls `awaitAcpBuiltinToolChildren` for them).
 */
export const execAcpBuiltinTool = async (
  deps: AcpBuiltinToolExecDeps,
  input: AcpBuiltinToolExecInput,
): Promise<AcpBuiltinToolExecResult> => {
  const { db, userId, workspaceId } = deps;
  const { apiName, args, identifier, operationId, toolCallId } = input;

  const operation = await loadAcpToolOperation(db, operationId);
  const allowlist = resolveToolAllowlist(operation, identifier, apiName);

  const appContext = (operation.appContext ?? {}) as Record<string, any>;
  const metadata = (operation.metadata ?? {}) as Record<string, any>;
  const assistantMessageId: string | undefined = metadata.assistantMessageId;
  const builtinToolContext = (metadata.builtinToolContext ?? {}) as {
    activeDeviceId?: string;
    activeDeviceScope?: 'personal' | 'workspace';
    workingDirectory?: string;
  };

  // The agent row supplies `world.agent` (sub-agent model overrides) and
  // `agentVisibility` for runtimes that persist visibility-scoped artifacts.
  const agentRow = operation.agentId
    ? (
        await db
          .select({
            agencyConfig: agents.agencyConfig,
            visibility: agents.visibility,
          })
          .from(agents)
          .where(eq(agents.id, operation.agentId))
          .limit(1)
      )[0]
    : undefined;

  // Group roster for the member-name → id resolution the runner performs.
  const chatGroupModel = new ChatGroupModel(db, userId, workspaceId);
  const agentGroup = operation.chatGroupId
    ? buildGroupAgentContext(
        operation.agentId ?? '',
        await chatGroupModel.findById(operation.chatGroupId),
        await chatGroupModel.getGroupAgentsWithMeta(operation.chatGroupId),
      )
    : undefined;

  // Wrap the delegates so forked child op ids surface to the caller — the
  // runner helpers return counts/placeholders, not the operation ids the
  // poll endpoint waits on.
  const childOperationIds = new Set<string>();
  const execGroupMember: AcpBuiltinToolExecDeps['execGroupMember'] = async (params) => {
    const result = await deps.execGroupMember(params);
    if (result?.operationId) childOperationIds.add(result.operationId);
    return result;
  };
  const execVirtualSubAgent: AcpBuiltinToolExecDeps['execVirtualSubAgent'] = async (params) => {
    const result = await deps.execVirtualSubAgent(params);
    if (result?.operationId) childOperationIds.add(result.operationId);
    return result;
  };
  const execSubAgent: AcpBuiltinToolExecDeps['execSubAgent'] = async (params) => {
    const result = await deps.execSubAgent(params);
    if (result?.operationId) childOperationIds.add(result.operationId);
    return result;
  };

  const chatToolPayload: ChatToolPayload = {
    apiName,
    arguments: JSON.stringify(args ?? {}),
    id: toolCallId,
    identifier,
    type: 'builtin',
  };

  const runnerCtx: OrchestrationRunnerContext = {
    execGroupMember,
    execSubAgent,
    execVirtualSubAgent,
    messageModel: new MessageModel(db, userId, workspaceId),
    operationId,
    topicId: operation.topicId ?? undefined,
  };
  const isChildRun = Boolean(operation.parentOperationId);
  const runnerState: OrchestrationRunnerState = {
    // The model this run actually uses — the sub-agent runner needs it to
    // compute the child's effective model (topic-pinned overrides live here,
    // not on `world.agent`).
    modelRuntimeConfig:
      (operation.modelRuntimeConfig as OrchestrationRunnerState['modelRuntimeConfig']) ?? undefined,
    origin: {
      agentId: operation.agentId ?? undefined,
      groupId: operation.chatGroupId ?? undefined,
      lineage: {
        isSubAgent: isChildRun,
        orchestrationRole: appContext.orchestrationRole,
        parentOperationId: operation.parentOperationId ?? undefined,
      },
      sourceMessageId: appContext.sourceMessageId,
      taskId: operation.taskId ?? undefined,
      threadId: operation.threadId ?? undefined,
      topicId: operation.topicId ?? undefined,
      userId,
      workspaceId: operation.workspaceId ?? workspaceId,
    },
    world: {
      agent: agentRow ? { agencyConfig: agentRow.agencyConfig ?? undefined } : undefined,
      group: agentGroup,
    },
  };

  // Manifests for runtimes that introspect sibling APIs (e.g. toolset gates).
  const toolManifestMap: Record<string, OrviloToolManifest> = Object.fromEntries(
    builtinTools
      .filter((tool) => allowlist[tool.identifier] && tool.manifest)
      .map((tool) => [tool.identifier, tool.manifest as OrviloToolManifest]),
  );

  const context: ToolExecutionContext = {
    activeDeviceId: builtinToolContext.activeDeviceId,
    activeDeviceScope: builtinToolContext.activeDeviceScope,
    agentId: operation.agentId ?? undefined,
    // The member runner needs the group + roster; the sub-agent runner needs
    // the tool payload anchor. Both no-op to `undefined` when the op lacks the
    // required context (e.g. no groupId for group-management calls).
    agentMember: buildServerAgentMemberRunner(
      runnerCtx,
      runnerState,
      chatToolPayload,
      assistantMessageId ?? '',
    ),
    agentVisibility: agentRow?.visibility ?? undefined,
    assistantMessageId,
    clientIp: appContext.clientIp,
    documentId: appContext.documentId,
    editingAgentId: appContext.editingAgentId,
    editingGroupId: appContext.editingGroupId,
    groupId: operation.chatGroupId,
    // Any child op (sub-agent OR member) must not spawn deeper nesting; the
    // durable parentOperationId marker covers both appContext.isSubAgent and
    // group members spawned via execAgentMember.
    isSubAgent: isChildRun,
    messageId: appContext.sourceMessageId,
    operationId,
    scope: appContext.scope,
    serverDB: db,
    subAgent: buildServerVirtualSubAgentRunner(
      runnerCtx,
      runnerState,
      chatToolPayload,
      assistantMessageId ?? '',
    ),
    taskId: operation.taskId ?? undefined,
    threadId: operation.threadId,
    toolCallId,
    toolManifestMap,
    topicId: operation.topicId ?? undefined,
    userId,
    workingDirectory: builtinToolContext.workingDirectory,
    workspaceId: operation.workspaceId ?? workspaceId,
  };

  // External connector / installed-plugin tools share the per-run MCP surface
  // and this callback, but their connection is resolved fresh on every call —
  // revoked credentials, disabled connectors or desynced tool names are caught
  // here, not at dispatch time.
  const externalMount = readExternalMounts(operation)?.[identifier];
  if (externalMount) {
    return execAcpExternalTool({
      context,
      db,
      identifier,
      mount: externalMount,
      operationAgentId: operation.agentId ?? undefined,
      payload: chatToolPayload,
      userId,
      workspaceId: operation.workspaceId ?? workspaceId,
    });
  }

  const result: ToolExecutionResult = await new BuiltinToolsExecutor(db, userId).execute(
    chatToolPayload,
    context,
  );

  // Work-registration intent — persist via the same one-shot path the old
  // runtime used, minus the cumulative-cost snapshot (unknown mid-run for ACP).
  if (result.workRegistration) {
    await registerWorkFromIntent({
      agentId: operation.agentId,
      intent: result.workRegistration,
      rootOperationId: operationId,
      serverDB: db,
      sourceMessageId: appContext.sourceMessageId,
      sourceToolCallId: toolCallId,
      sourceToolIdentifier: identifier,
      sourceToolName: apiName,
      threadId: operation.threadId,
      topicId: operation.topicId ?? undefined,
      userId,
      workspaceId: operation.workspaceId ?? workspaceId,
    });
  }

  if (result.deferred) {
    return {
      childOperationIds: [...childOperationIds],
      content: result.content,
      deferred: true,
      state: result.state,
      success: true,
    };
  }

  return {
    content: result.content,
    error: result.error
      ? { code: result.error.code, message: result.error.message ?? String(result.error) }
      : undefined,
    state: result.state,
    success: result.success,
  };
};

/**
 * Execute one external (connector / installed-plugin MCP) tool call for an ACP
 * run. The dispatch-time mount only stored api names + source; this re-reads
 * the live row on every call:
 *   - connector: agent-aware `resolveByIdentifiers` + `isEnabled` + synced,
 *     non-disabled tool name + fresh OAuth token → `buildConnectorMcpParams`
 *   - mcp-plugin: installed manifest api list + `customParams.mcp` transport
 * Either way the actual call goes through `ToolExecutionService.executeTool`
 * (`type: 'mcp'`), so permission gating, device tunnelling and truncation all
 * behave identically to the classic path.
 */
const execAcpExternalTool = async (input: {
  context: ToolExecutionContext;
  db: OrviloDatabase;
  identifier: string;
  mount: ExternalToolMountMetadata;
  operationAgentId?: string;
  payload: ChatToolPayload;
  userId: string;
  workspaceId?: string;
}): Promise<AcpBuiltinToolExecResult> => {
  const { context, db, identifier, mount, operationAgentId, payload, userId, workspaceId } = input;

  let manifest: OrviloToolManifest;
  if (mount.source === 'connector') {
    const connectorModel = new ConnectorModel(db, userId, workspaceId);
    const [connector] = await connectorModel.resolveByIdentifiers([identifier], operationAgentId);
    if (!connector) {
      throw new AcpBuiltinToolNotFoundError(`Connector '${identifier}' not found`);
    }
    if (!connector.isEnabled) {
      throw new AcpBuiltinToolForbiddenError(`Connector '${identifier}' is disabled`);
    }

    const connectorToolModel = new ConnectorToolModel(db, userId, workspaceId);
    const tools = await connectorToolModel.queryByConnector(connector.id);
    const tool = tools.find((item) => item.toolName === payload.apiName);
    if (!tool) {
      throw new AcpBuiltinToolNotFoundError(
        `Tool '${payload.apiName}' is not synced on connector '${identifier}'`,
      );
    }
    if (tool.permission === ConnectorToolPermission.disabled) {
      throw new AcpBuiltinToolForbiddenError(
        `Tool '${payload.apiName}' is disabled on connector '${identifier}'`,
      );
    }

    const fresh = await ensureFreshConnectorToken(connector, connectorModel);
    manifest = {
      api: tools.map((item) => ({
        description: item.description ?? undefined,
        name: item.toolName,
        parameters: (item.inputSchema ?? {}) as Record<string, unknown>,
      })),
      identifier,
      meta: {},
      mcpParams: buildConnectorMcpParams(fresh),
      type: 'mcp',
    } as unknown as OrviloToolManifest;
  } else {
    const plugin = await new PluginModel(db, userId, workspaceId).findById(identifier);
    const mcpParams =
      plugin?.customParams?.mcp ??
      (plugin?.manifest as { mcpParams?: unknown } | null | undefined)?.mcpParams;
    if (!plugin?.manifest?.api?.length || !mcpParams) {
      throw new AcpBuiltinToolNotFoundError(
        `Plugin '${identifier}' is not installed or has no callable MCP transport`,
      );
    }
    manifest = { ...(plugin.manifest as OrviloToolManifest), mcpParams } as OrviloToolManifest;
  }

  const result = await new ToolExecutionService({
    builtinToolsExecutor: new BuiltinToolsExecutor(db, userId),
    mcpService,
  }).executeTool(
    { ...payload, type: 'mcp' },
    {
      ...context,
      toolManifestMap: { ...context.toolManifestMap, [identifier]: manifest },
    },
  );

  return {
    content: result.content,
    error: result.error
      ? { code: result.error.code, message: result.error.message ?? String(result.error) }
      : undefined,
    state: result.state,
    success: result.success,
  };
};

export interface AcpBuiltinToolChildResult {
  content?: string;
  error?: string;
  operationId: string;
  status: string;
}

/**
 * Poll the children a deferred builtin tool forked. A child counts as pending
 * until it reaches a TERMINAL status — `idle`, `waiting_for_human` and
 * `waiting_for_async_tool` children are still alive and must not settle the
 * parent's tool call.
 *
 * Once all are terminal the call resolves each child's final assistant
 * content, sweeps the placeholder tool rows OWNED by this invocation
 * (`tool_call_id` = toolCallId or `${toolCallId}::m<index>` — anchored, so a
 * prefix-sharing call's rows are never swept), and records each child's
 * result in the `event_outbox` delivery ledger: the completion bridge's
 * `pending` row flips to `delivered` (parent consumed), or a fresh
 * delivered row is written when no bridge ran.
 *
 * `waitDeadlineMs` is a server-side cumulative bound keyed by the placeholder
 * row's `awaitStartedAt`, so it survives host reconnects: when a child
 * heartbeats forever, the owned placeholders are settled to `error` and the
 * call returns `timeout` — surfacing the stall for human handling instead of
 * hanging.
 */
export const awaitAcpBuiltinToolChildren = async (
  deps: Pick<AcpBuiltinToolExecDeps, 'db' | 'userId' | 'workspaceId'>,
  input: {
    childOperationIds: string[];
    operationId: string;
    timeoutMs?: number;
    toolCallId?: string;
    waitDeadlineMs?: number;
  },
): Promise<
  | { results: AcpBuiltinToolChildResult[]; status: 'settled' }
  | { pendingOperationIds: string[]; status: 'pending' | 'timeout' }
> => {
  const { db, userId, workspaceId } = deps;
  const deadline = Date.now() + Math.min(input.timeoutMs ?? 25_000, 30_000);
  const wanted = [...new Set(input.childOperationIds)];
  if (wanted.length === 0) return { results: [], status: 'settled' };

  const ownedPlaceholderRows = async () => {
    if (!input.toolCallId) return [];
    const candidates = await db
      .select({
        id: messagePlugins.id,
        state: messagePlugins.state,
        toolCallId: messagePlugins.toolCallId,
      })
      .from(messagePlugins)
      .where(
        and(
          like(messagePlugins.toolCallId, `${input.toolCallId}%`),
          eq(messagePlugins.userId, userId),
        ),
      );
    return candidates.filter((row) => isOwnedToolCallId(row.toolCallId, input.toolCallId!));
  };

  // Long-poll: bounded server-side wait so one MCP call doesn't spin a request
  // per second. The CLI loops until `settled`/`timeout`.
  for (;;) {
    const rows = await db
      .select({
        error: agentOperations.error,
        id: agentOperations.id,
        metadata: agentOperations.metadata,
        status: agentOperations.status,
      })
      .from(agentOperations)
      .where(
        and(
          eq(agentOperations.parentOperationId, input.operationId),
          inArray(agentOperations.id, wanted),
        ),
      );

    const byId = new Map(rows.map((row) => [row.id, row]));
    const pendingIds = wanted.filter((id) => !isTerminalAgentOperationStatus(byId.get(id)?.status));
    const allSeen = wanted.every((id) => byId.has(id));

    if (allSeen && pendingIds.length === 0) {
      const messageModel = new MessageModel(db, userId, workspaceId);
      const results: AcpBuiltinToolChildResult[] = [];
      for (const id of wanted) {
        const row = byId.get(id)!;
        let content: string | undefined;
        const assistantMessageId = (row.metadata as any)?.assistantMessageId;
        if (assistantMessageId) {
          const msg = await messageModel.findById(assistantMessageId).catch(() => undefined);
          content = (msg?.content as string | undefined) ?? undefined;
        }
        results.push({
          content,
          error: row.error ? String((row.error as any)?.message ?? row.error) : undefined,
          operationId: id,
          status: row.status,
        });
      }

      // Backfill safety net: rows the completion bridges didn't reach (or a
      // sub-agent placeholder whose bridge failed) must not stay `pending`.
      if (input.toolCallId) {
        try {
          const owned = await ownedPlaceholderRows();
          const summary = results
            .map((r) => r.content ?? r.error ?? `(${r.status})`)
            .filter(Boolean)
            .join('\n\n');
          for (const row of owned) {
            const status = (row.state as { status?: string } | null)?.status ?? 'pending';
            if (status !== 'pending') continue;
            await messageModel.updateToolMessage(row.id, {
              content: summary,
              pluginState: {
                status: results.some((r) => r.status !== 'done') ? 'error' : 'completed',
              },
            });
          }
        } catch (err) {
          log('awaitAcpBuiltinToolChildren: placeholder sweep failed: %O', err);
        }
      }

      // Delivery ledger: the bridge writes `pending` when the child's result
      // was persisted; handing it to the caller here is the consume point, so
      // mark each child's receipt delivered (inserting it first when no
      // bridge ran — e.g. a placeholder swept above).
      try {
        const outbox = new EventOutboxModel(db);
        const [parentRow] = await db
          .select({
            appContext: agentOperations.appContext,
            workspaceId: agentOperations.workspaceId,
          })
          .from(agentOperations)
          .where(eq(agentOperations.id, input.operationId))
          .limit(1);
        const generation =
          ((parentRow?.appContext as Record<string, unknown> | null)?.executionGeneration as
            number | undefined) ?? 0;
        for (const result of results) {
          await outbox.upsertDeliveryReceipt({
            delivered: true,
            event: {
              aggregateId: input.operationId,
              aggregateType: 'agent_operation',
              eventId: childResultEventId({
                childOperationId: result.operationId,
                generation,
                parentOperationId: input.operationId,
                toolCallId: input.toolCallId,
              }),
              eventType: CHILD_RESULT_EVENT_TYPE,
              payload: { status: result.status },
              workspaceId: parentRow?.workspaceId ?? workspaceId,
            },
          });
        }
      } catch (err) {
        log('awaitAcpBuiltinToolChildren: delivery ledger write failed: %O', err);
      }

      return { results, status: 'settled' };
    }

    if (Date.now() >= deadline) {
      // Server-side cumulative wait bound: the placeholder's `awaitStartedAt`
      // stamps the first poll that found live children, so the bound is
      // durable across host reconnects. Crossing it settles the owned
      // placeholders to `error` — the stall becomes a visible failure a human
      // can act on instead of an infinite pending.
      if (input.waitDeadlineMs && input.toolCallId) {
        try {
          const owned = await ownedPlaceholderRows();
          const anchor = owned.find((row) => row.toolCallId === input.toolCallId) ?? owned[0];
          const startedAt = (anchor?.state as { awaitStartedAt?: number } | null)?.awaitStartedAt;
          const now = Date.now();
          if (!startedAt) {
            const messageModel = new MessageModel(db, userId, workspaceId);
            for (const row of owned) {
              await messageModel.updateToolMessage(row.id, {
                pluginState: { awaitStartedAt: now },
              });
            }
          } else if (now - startedAt >= input.waitDeadlineMs) {
            const messageModel = new MessageModel(db, userId, workspaceId);
            for (const row of owned) {
              const status = (row.state as { status?: string } | null)?.status ?? 'pending';
              if (status !== 'pending') continue;
              await messageModel.updateToolMessage(row.id, {
                content: `Timed out waiting for child operations: ${pendingIds.join(', ')}`,
                pluginState: { status: 'error', waitDeadlineExceeded: true },
              });
            }
            return { pendingOperationIds: pendingIds, status: 'timeout' };
          }
        } catch (err) {
          log('awaitAcpBuiltinToolChildren: deadline bookkeeping failed: %O', err);
        }
      }
      return { pendingOperationIds: allSeen ? pendingIds : wanted, status: 'pending' };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

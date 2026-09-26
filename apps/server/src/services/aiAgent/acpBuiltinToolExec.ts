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
import { and, eq, inArray, like, sql } from 'drizzle-orm';

import { ChatGroupModel } from '@/database/models/chatGroup';
import { ConnectorModel } from '@/database/models/connector';
import { ConnectorToolModel } from '@/database/models/connectorTool';
import { EventOutboxModel, newEventId } from '@/database/models/eventOutbox';
import { MessageModel } from '@/database/models/message';
import { PluginModel } from '@/database/models/plugin';
import {
  agentOperations,
  agents,
  ConnectorToolPermission,
  messagePlugins,
  messages,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import type {
  ExecGroupMemberParams,
  ExecGroupMemberResult,
} from '@/server/services/agentExecution/types';
import {
  getGitHubMcpGrantIdentity,
  isGitHubMcpConnector,
} from '@/server/services/connector/githubMcp';
import { resolveConnectorMcpParams } from '@/server/services/connector/sync';
import { mcpService } from '@/server/services/mcp';
import { ToolExecutionService } from '@/server/services/toolExecution';
import { BuiltinToolsExecutor } from '@/server/services/toolExecution/builtin';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from '@/server/services/toolExecution/types';

import {
  CHILD_RESULT_EVENT_TYPE,
  CHILD_RESULT_RECEIPT_TTL_MS,
  childResultEventId,
  isOwnedToolCallId,
} from '../agentExecution/childResultDelivery';
import {
  authorizeToolApprovalReceipt,
  buildToolApprovalEvent,
  TOOL_APPROVAL_TTL_MS,
  toolApprovalEventId,
  type ToolApprovalScope,
  toolApprovalScopeHash,
} from '../agentExecution/toolApprovalReceipt';
import { buildGroupAgentContext } from './helpers/groupContext';
import {
  buildServerAgentMemberRunner,
  buildServerVirtualSubAgentRunner,
  type OrchestrationRunnerContext,
  type OrchestrationRunnerState,
  registerWorkFromIntent,
} from './orchestrationRunners';
import {
  apiSchemaDigest,
  connectorAuthRevision,
  type ExternalToolPins,
  pluginInstallPin,
  sha256Hex,
  stableStringify,
} from './pipeline/externalToolPins';

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
  /**
   * Mount-time identity pins (SA02/F04): the exact connection/install + grant
   * revision + per-api schema digests the dispatch authorized. Exec
   * re-authorizes the SAME row — never a different connection that happens to
   * share the identifier.
   */
  pins?: ExternalToolPins;
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
      operation,
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
  operation: OperationRow;
  payload: ChatToolPayload;
  userId: string;
  workspaceId?: string;
}): Promise<AcpBuiltinToolExecResult> => {
  const { context, db, identifier, mount, operation, payload, userId, workspaceId } = input;
  const pins = mount.pins;

  // The approval contract mounted with this run: the receipt binds the
  // pinned connection/install, grant revision, per-api schema and args hash.
  let authRevision: string | undefined;
  let schemaDigest: string | undefined;

  let manifest: OrviloToolManifest;
  if (mount.source === 'connector') {
    const connectorModel = new ConnectorModel(db, userId, workspaceId);
    // Pinned mounts re-load the exact authorized row; a same-identifier row is
    // never substituted (C03). Only legacy mounts recorded before pins existed
    // fall back to identifier resolution.
    const connector = pins?.connectorId
      ? await connectorModel.findById(pins.connectorId)
      : (
          await connectorModel.resolveByIdentifiers([identifier], operation.agentId ?? undefined)
        )[0];
    if (!connector) {
      throw new AcpBuiltinToolNotFoundError(`Connector '${identifier}' not found`);
    }
    if (connector.identifier !== identifier) {
      // The pinned row no longer claims this identifier (re-link / row reuse)
      // — refuse rather than let the mount drift onto a different connection.
      throw new AcpBuiltinToolForbiddenError(
        `Pinned connector for '${identifier}' no longer carries that identifier`,
      );
    }
    if (!connector.isEnabled) {
      throw new AcpBuiltinToolForbiddenError(`Connector '${identifier}' is disabled`);
    }
    const githubGrant = isGitHubMcpConnector(connector)
      ? await getGitHubMcpGrantIdentity({ connector, db })
      : null;
    if (isGitHubMcpConnector(connector) && !githubGrant) {
      throw new AcpBuiltinToolForbiddenError(
        `GitHub authorization for connector '${identifier}' is unavailable`,
      );
    }
    if (
      githubGrant &&
      ((pins?.grantRevision && pins.grantRevision !== githubGrant.grantRevision) ||
        (pins?.githubUserId && pins.githubUserId !== githubGrant.githubUserId))
    ) {
      throw new AcpBuiltinToolForbiddenError(
        `Connector '${identifier}' GitHub identity or grant changed since dispatch; remount required`,
      );
    }
    authRevision = connectorAuthRevision(connector, githubGrant);
    if (pins?.authRevision && authRevision !== pins.authRevision) {
      throw new AcpBuiltinToolForbiddenError(
        `Connector '${identifier}' was re-authorized since dispatch; remount required`,
      );
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
    schemaDigest = apiSchemaDigest(tool.inputSchema ?? {});
    const pinnedDigest = pins?.schemaDigests?.[payload.apiName];
    if (pinnedDigest && pinnedDigest !== schemaDigest) {
      throw new AcpBuiltinToolForbiddenError(
        `Tool '${payload.apiName}' schema changed since dispatch; remount required`,
      );
    }
    if (tool.permission === ConnectorToolPermission.needs_approval) {
      const refused = await gateAcpExternalToolApproval({
        apiName: payload.apiName,
        argsJson: payload.arguments,
        authRevision,
        connectorId: connector.id,
        db,
        grantRevision: githubGrant?.grantRevision,
        identifier,
        kind: 'connector_tool',
        operation,
        schemaDigest,
        toolCallId: payload.id,
        userId,
        workspaceId,
      });
      if (refused) return refused;
    }

    manifest = {
      api: tools.map((item) => ({
        description: item.description ?? undefined,
        name: item.toolName,
        parameters: (item.inputSchema ?? {}) as Record<string, unknown>,
      })),
      identifier,
      meta: {},
      mcpParams: await resolveConnectorMcpParams(
        connector,
        { connectorModel, serverDB: db },
        githubGrant
          ? {
              githubUserId: githubGrant.githubUserId,
              grantRevision: githubGrant.grantRevision,
            }
          : undefined,
      ),
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
    const installPin = pluginInstallPin(plugin);
    if (pins?.pluginInstallId && installPin !== pins.pluginInstallId) {
      // A different install generation now owns the identifier — the mount
      // authorized a specific install, refuse the substitution.
      throw new AcpBuiltinToolForbiddenError(
        `Plugin '${identifier}' was reinstalled since dispatch; remount required`,
      );
    }
    const pluginApi = plugin.manifest.api.find((api) => api.name === payload.apiName);
    schemaDigest = apiSchemaDigest(pluginApi?.parameters ?? {});
    const pinnedDigest = pins?.schemaDigests?.[payload.apiName];
    if (pinnedDigest && pinnedDigest !== schemaDigest) {
      throw new AcpBuiltinToolForbiddenError(
        `Tool '${payload.apiName}' schema changed since dispatch; remount required`,
      );
    }
    // Manifest-declared intervention policies ride the same receipt contract
    // as connector `needs_approval` rows — the host surfaces a permission
    // card, the server consumes a one-time receipt.
    const apiPolicy = pluginApi?.humanIntervention;
    const manifestPolicy = (plugin.manifest as { humanIntervention?: unknown }).humanIntervention;
    const requiresApproval =
      apiPolicy === 'required' ||
      apiPolicy === 'always' ||
      (apiPolicy === undefined && (manifestPolicy === 'required' || manifestPolicy === 'always'));
    if (requiresApproval) {
      const refused = await gateAcpExternalToolApproval({
        apiName: payload.apiName,
        argsJson: payload.arguments,
        db,
        identifier,
        kind: 'plugin_tool',
        operation,
        pluginInstallId: installPin,
        schemaDigest,
        toolCallId: payload.id,
        userId,
        workspaceId,
      });
      if (refused) return refused;
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

/**
 * Unified tool-authorization step for approval-gated external calls (F04).
 *
 * The gate runs BEFORE `ToolExecutionService.executeTool` — a refused call
 * produces zero network side effects (`mcpService.callTool` never runs). A
 * missing receipt creates a pending one bound to
 * principal/workspace/operation/generation/toolCallId/connection/argsHash and
 * returns a `pending` result the host turns into an intervention card; the
 * human decision lands via `submitHeteroIntervention` (user-auth channel —
 * the op-token path can only ever create or observe a receipt, never decide
 * it). Headless runs and runs with no interaction surface refuse explicitly.
 */
const gateAcpExternalToolApproval = async (params: {
  apiName: string;
  argsJson: string;
  authRevision?: string;
  connectorId?: string;
  db: OrviloDatabase;
  identifier: string;
  grantRevision?: string;
  kind: 'connector_tool' | 'plugin_tool';
  operation: OperationRow;
  pluginInstallId?: string;
  schemaDigest?: string;
  toolCallId: string;
  userId: string;
  workspaceId?: string;
}): Promise<AcpBuiltinToolExecResult | undefined> => {
  const { db, operation, toolCallId } = params;
  const appContext = (operation.appContext ?? {}) as Record<string, unknown>;
  const now = Date.now();

  // Headless / no-interaction runs are not auto-approve — the call cannot
  // reach a human, so it refuses outright without creating a receipt.
  if (appContext.interventionApprovalMode === 'headless') {
    return {
      error: {
        code: 'acp_tool_approval_unavailable',
        message: `Tool '${params.identifier}.${params.apiName}' requires human approval and this run has no interaction surface`,
      },
      success: false,
    };
  }

  const expiresAt = now + TOOL_APPROVAL_TTL_MS;
  const argsHash = sha256Hex(stableStringify(safeParseJson(params.argsJson)));
  // The canonical approval scope this call must match at consume time — the
  // receipt persists its digest (`scopeHash`) so an approval minted for tool
  // A can never be spent by a same-toolCallId/same-args call to tool B.
  const scope: ToolApprovalScope = {
    agentId: operation.agentId ?? undefined,
    apiName: params.apiName,
    argsHash,
    authRevision: params.authRevision,
    connectorId: params.connectorId,
    executionGeneration: (appContext.executionGeneration as number | undefined) ?? undefined,
    identifier: params.identifier,
    grantRevision: params.grantRevision,
    kind: params.kind,
    operationId: operation.id,
    pluginInstallId: params.pluginInstallId,
    schemaDigest: params.schemaDigest,
    toolCallId,
    userId: operation.userId,
    workspaceId: params.workspaceId ?? operation.workspaceId ?? '',
  };
  const scopeHash = toolApprovalScopeHash(scope);
  const event = buildToolApprovalEvent({
    ...scope,
    expiresAt,
    now,
    windowId: newEventId(),
  });
  // Insert is dedupe-stable on eventId — retries/concurrent polls converge on
  // the same receipt rather than stacking approvals.
  await new EventOutboxModel(db).upsertDeliveryReceipt({ event });

  const authorization = await authorizeToolApprovalReceipt(db, {
    argsHash,
    // The stable invocation id is the toolCallId itself — the host mints it
    // once per logical call and reuses it across crash/renew retries, which
    // is also what makes the consume CAS idempotent for that invocation.
    invocationId: toolCallId,
    now,
    operationId: operation.id,
    scopeHash,
    toolCallId,
  });
  const status = authorization.status;
  if (status === 'approved') return undefined;

  if (status === 'expired') {
    // An expired receipt with no terminal decision re-pends under a fresh
    // window; a stale APPROVAL inside the dead window is cleared by the renew
    // CAS so it can never ride the new window. Each renew rotates `windowId`
    // (+ bumps `windowVersion`) and re-binds the scope to THIS call, so a
    // card answered for a previous window is rejected as `stale_window`.
    const renewWindowId = newEventId();
    const renewed = await new EventOutboxModel(db).renewToolApprovalReceipt({
      argsHash,
      eventId: toolApprovalEventId(operation.id, toolCallId),
      expiresAt,
      now,
      scopeHash,
      windowId: renewWindowId,
    });
    if (renewed) {
      return {
        error: {
          code: 'acp_tool_approval_pending',
          message: `Tool '${params.identifier}.${params.apiName}' requires human approval`,
        },
        state: { toolApproval: { expiresAt, renewed: true, windowId: renewWindowId } },
        success: false,
      };
    }
  }

  const reason =
    status === 'denied'
      ? 'acp_tool_approval_denied'
      : status === 'consumed'
        ? 'acp_tool_approval_consumed'
        : status === 'args_mismatch'
          ? 'acp_tool_approval_args_mismatch'
          : status === 'scope_mismatch'
            ? 'acp_tool_approval_scope_mismatch'
            : status === 'expired'
              ? 'acp_tool_approval_expired'
              : 'acp_tool_approval_pending';
  return {
    error: {
      code: reason,
      message:
        status === 'denied'
          ? `The user denied '${params.identifier}.${params.apiName}'`
          : status === 'consumed'
            ? `Approval for '${params.identifier}.${params.apiName}' was already consumed`
            : status === 'args_mismatch'
              ? `Approval for '${params.identifier}.${params.apiName}' covered different arguments`
              : status === 'scope_mismatch'
                ? `Approval for '${params.identifier}.${params.apiName}' covered a different tool scope`
                : status === 'expired'
                  ? `Approval for '${params.identifier}.${params.apiName}' expired`
                  : `Tool '${params.identifier}.${params.apiName}' requires human approval`,
    },
    state: {
      toolApproval: {
        expiresAt: authorization.expiresAt ?? expiresAt,
        windowId: authorization.windowId,
        windowVersion: authorization.windowVersion,
      },
    },
    success: false,
  };
};

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export interface AcpBuiltinToolChildResult {
  content?: string;
  error?: string;
  operationId: string;
  status: string;
}

/** One child result's ledger position returned on a v2 settle. */
export interface AcpChildResultDelivery {
  childOperationId: string;
  deliveryState: 'acked' | 'offered' | 'received' | 'superseded';
  /** `event_outbox` dedupe key the parent acks against. */
  eventId: string;
}

/**
 * Default cumulative bound for awaits that never pass `waitDeadlineMs`
 * (legacy/old hosts): the anchor's deadline is still persisted so a missing
 * anchor can never pend forever.
 */
const AWAIT_DEFAULT_DEADLINE_MS = 60 * 60 * 1000;

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
    /**
     * Ledger contract the host understands. `1` (default, legacy hosts):
     * settle flips receipts straight to `delivered` — preserved for
     * backward compatibility. `2`: settle writes `offered` and returns
     * `deliveries[]`; the parent durably consumes via
     * `heteroAckChildResultDeliveries`, so a lost HTTP response replays
     * instead of losing the result.
     */
    contractVersion?: number;
    operationId: string;
    timeoutMs?: number;
    toolCallId?: string;
    waitDeadlineMs?: number;
  },
): Promise<
  | {
      contractVersion: number;
      deliveries?: AcpChildResultDelivery[];
      results: AcpBuiltinToolChildResult[];
      status: 'settled';
    }
  | { contractVersion: number; pendingOperationIds: string[]; status: 'pending' | 'timeout' }
> => {
  const { db, userId, workspaceId } = deps;
  const deadline = Date.now() + Math.min(input.timeoutMs ?? 25_000, 30_000);
  const wanted = [...new Set(input.childOperationIds)];
  const contractVersion = input.contractVersion === 2 ? 2 : 1;
  if (wanted.length === 0) return { contractVersion, results: [], status: 'settled' };

  // Parent row once: the generation keys every child-result event id, and the
  // topic scopes the placeholder sweep (D06 — a placeholder in another
  // operation's topic sharing this user + toolCallId must never be swept).
  const [parentRow] = await db
    .select({
      appContext: agentOperations.appContext,
      topicId: agentOperations.topicId,
      workspaceId: agentOperations.workspaceId,
    })
    .from(agentOperations)
    .where(eq(agentOperations.id, input.operationId))
    .limit(1);
  const parentTopicId = parentRow?.topicId ?? null;
  const generation =
    ((parentRow?.appContext as Record<string, unknown> | null)?.executionGeneration as
      number | undefined) ?? 0;

  const ownedPlaceholderRows = async () => {
    if (!input.toolCallId) return [];
    const candidates = await db
      .select({
        id: messagePlugins.id,
        messageTopicId: messages.topicId,
        ownerOperationId: sql<string | null>`${messagePlugins.state}->>'awaitOwnerOperationId'`,
        state: messagePlugins.state,
        toolCallId: messagePlugins.toolCallId,
      })
      .from(messagePlugins)
      // The placeholder's scoping message carries the topic — placeholders
      // live one-per-message, and the tool call's topic is the parent's.
      .innerJoin(messages, eq(messagePlugins.id, messages.id))
      .where(
        and(
          like(messagePlugins.toolCallId, `${input.toolCallId}%`),
          eq(messagePlugins.userId, userId),
        ),
      );
    return candidates.filter(
      (row) =>
        isOwnedToolCallId(row.toolCallId, input.toolCallId!) &&
        // Cross-operation isolation: the row must live in THIS operation's
        // topic, and once another operation has claimed it
        // (`awaitOwnerOperationId`) it is never ours.
        (!parentTopicId || row.messageTopicId === parentTopicId) &&
        (!row.ownerOperationId || row.ownerOperationId === input.operationId),
    );
  };

  // The single authoritative deadline for this delegation (SA04-B): the
  // keyed `await-anchor` outbox receipt, CAS-written below by whichever poll
  // first observes a pending state. `undefined` until resolved this request.
  let awaitDeadlineAt: number | undefined;
  let anchorEventId: string | undefined;
  // Set when an earlier pass recorded that the placeholder projection owed
  // to this wait failed durably on the anchor — drained (retried) on later
  // passes so a transient IO error never lengthens the deadline itself.
  let anchorProjectionPending = false;

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

      // Delivery ledger (F06): the bridge commits `received` when the child's
      // result is persisted; a v2 settle moves it to `offered` — handed to the
      // caller but NOT consumed — and returns `deliveries[]` for the parent's
      // durable inbox ACK (`heteroAckChildResultDeliveries`). A lost HTTP
      // response then replays: the next poll re-derives the results and
      // re-offers idempotently. Legacy v1 callers keep consume-on-settle.
      // The ledger write is NOT swallowed: a settle that cannot persist its
      // delivery state must fail rather than report reliable delivery.
      const outbox = new EventOutboxModel(db);
      const deliveries: AcpChildResultDelivery[] = [];
      for (const result of results) {
        const eventId = childResultEventId({
          childOperationId: result.operationId,
          generation,
          parentOperationId: input.operationId,
          toolCallId: input.toolCallId,
        });
        if (contractVersion === 2) {
          // Ensure the row exists (no bridge ran — e.g. a placeholder swept
          // above), then `received → offered`. `acked`/`superseded` rows are
          // untouched — replay never downgrades a consumed receipt.
          const deadlineAt = Date.now() + CHILD_RESULT_RECEIPT_TTL_MS;
          await outbox.upsertDeliveryReceipt({
            event: {
              aggregateId: input.operationId,
              aggregateType: 'agent_operation',
              eventId,
              eventType: CHILD_RESULT_EVENT_TYPE,
              nextAttemptAt: new Date(deadlineAt),
              payload: {
                deadlineAt,
                deliveryState: 'received',
                status: result.status,
              },
              workspaceId: parentRow?.workspaceId ?? workspaceId,
            },
          });
          await outbox.offerDeliveryReceiptByEventId(eventId);
          // Report the REAL receipt state, not the transition we attempted:
          // a replayed settle may find the row already `acked` (the previous
          // ack landed but its response was lost) — reporting 'offered' then
          // would make the host retry an ack that can only read as ignored.
          const receiptState = await outbox.getDeliveryReceiptState({ eventId });
          const state = receiptState?.deliveryState;
          deliveries.push({
            childOperationId: result.operationId,
            deliveryState:
              state === 'acked' || state === 'superseded' || state === 'received'
                ? state
                : 'offered',
            eventId,
          });
        } else {
          await outbox.upsertDeliveryReceipt({
            delivered: true,
            event: {
              aggregateId: input.operationId,
              aggregateType: 'agent_operation',
              eventId,
              eventType: CHILD_RESULT_EVENT_TYPE,
              payload: { status: result.status },
              workspaceId: parentRow?.workspaceId ?? workspaceId,
            },
          });
        }
      }

      return { contractVersion, deliveries, results, status: 'settled' };
    }

    // Resolve the authoritative wait deadline at first admission (any pending
    // observation): read the await-anchor receipt; when absent, CAS-write
    // `now + waitBudget`. A racing first poll that loses the CAS re-reads the
    // winner's instant, so every poll — including reconnects and ones that
    // later gain a message anchor — converges on ONE server-determined
    // deadline. Read/write failures throw instead of letting heartbeats pend
    // forever. Legacy receipts storing a relative budget under the same key
    // would still read as a number here; only absolute `awaitDeadlineAt`
    // values are written by this contract.
    if (input.toolCallId && awaitDeadlineAt === undefined) {
      const outbox = new EventOutboxModel(db);
      anchorEventId = `await-anchor:${input.operationId}:${input.toolCallId}`;
      const existing = await outbox.getDeliveryReceiptPayload(anchorEventId);
      if (typeof existing?.awaitDeadlineAt === 'number') {
        awaitDeadlineAt = existing.awaitDeadlineAt;
        anchorProjectionPending = existing.projectionPending === true;
      } else {
        const proposed = Date.now() + (input.waitDeadlineMs ?? AWAIT_DEFAULT_DEADLINE_MS);
        const outcome = await outbox.upsertDeliveryReceipt({
          event: {
            aggregateId: input.operationId,
            aggregateType: 'agent_operation',
            eventId: anchorEventId,
            eventType: 'agent_operation.await_deadline',
            nextAttemptAt: new Date(proposed),
            payload: { awaitDeadlineAt: proposed },
            workspaceId: parentRow?.workspaceId ?? workspaceId,
          },
        });
        if (outcome === 'replayed') {
          const winner = await outbox.getDeliveryReceiptPayload(anchorEventId);
          if (typeof winner?.awaitDeadlineAt !== 'number') {
            throw new Error(
              `Await-deadline anchor '${anchorEventId}' exists but carries no readable deadline`,
            );
          }
          awaitDeadlineAt = winner.awaitDeadlineAt;
          anchorProjectionPending = winner.projectionPending === true;
        } else {
          awaitDeadlineAt = proposed;
        }
      }
    }

    if (Date.now() >= deadline) {
      // Server-side cumulative wait bound (F06 + SA04-B, hardened SC-SB07):
      // `awaitDeadlineAt` from the anchor receipt is the ONLY authority for
      // the timeout verdict — it is compared BEFORE any projection IO runs,
      // so a placeholder read/write failure can never turn an expired wait
      // back into `pending` (nor lengthen it). The placeholder mirror is a
      // pure best-effort projection: its failure is queued durably on the
      // anchor (`projectionPending`) and retried on the next pass.
      //
      // Race policy: the all-terminal settle check above runs BEFORE this
      // deadline check on every pass — a terminal-children observation wins
      // over expiry (settled truth beats a wall-clock guess); the deadline
      // only bounds waits that are still pending.
      if (input.toolCallId && awaitDeadlineAt !== undefined && anchorEventId) {
        const outbox = new EventOutboxModel(db);
        const now = Date.now();
        if (now >= awaitDeadlineAt) {
          try {
            const owned = await ownedPlaceholderRows();
            const messageModel = new MessageModel(db, userId, workspaceId);
            for (const row of owned) {
              const status = (row.state as { status?: string } | null)?.status ?? 'pending';
              if (status !== 'pending') continue;
              await messageModel.updateToolMessage(row.id, {
                content: `Timed out waiting for child operations: ${pendingIds.join(', ')}`,
                pluginState: { status: 'error', waitDeadlineExceeded: true },
              });
            }
            if (anchorProjectionPending) {
              await outbox.mergeDeliveryReceiptPayload({
                eventId: anchorEventId,
                patch: { projectedAt: now, projectionPending: false },
              });
              anchorProjectionPending = false;
            }
          } catch (err) {
            // The verdict above already committed — this only records the
            // durable compensation debt on the anchor for a later pass.
            log(
              'awaitAcpBuiltinToolChildren: timeout projection failed, compensation queued: %O',
              err,
            );
            await outbox
              .mergeDeliveryReceiptPayload({
                eventId: anchorEventId,
                patch: { projectionPending: true },
              })
              .catch((markerErr) =>
                log('awaitAcpBuiltinToolChildren: could not record projection debt: %O', markerErr),
              );
          }
          return { contractVersion, pendingOperationIds: pendingIds, status: 'timeout' };
        }
        // Projection upkeep: stamp the authoritative deadline + owner onto
        // placeholders that don't yet mirror it (first accept, a later-
        // appearing anchor, or a legacy row that only had awaitStartedAt),
        // and drain a pending compensation pass for free while we're here.
        try {
          const owned = await ownedPlaceholderRows();
          const messageModel = new MessageModel(db, userId, workspaceId);
          for (const row of owned) {
            const rowState = row.state as
              | {
                  awaitDeadlineAt?: number;
                  awaitOwnerOperationId?: string;
                  awaitStartedAt?: number;
                }
              | null
              | undefined;
            if (
              rowState?.awaitDeadlineAt === awaitDeadlineAt &&
              rowState?.awaitOwnerOperationId === input.operationId
            ) {
              continue;
            }
            await messageModel.updateToolMessage(row.id, {
              pluginState: {
                awaitDeadlineAt,
                awaitOwnerOperationId: input.operationId,
                awaitStartedAt: rowState?.awaitStartedAt ?? now,
              },
            });
          }
          if (anchorProjectionPending) {
            await outbox.mergeDeliveryReceiptPayload({
              eventId: anchorEventId,
              patch: { projectedAt: now, projectionPending: false },
            });
            anchorProjectionPending = false;
          }
        } catch (err) {
          log('awaitAcpBuiltinToolChildren: deadline bookkeeping failed: %O', err);
          await outbox
            .mergeDeliveryReceiptPayload({
              eventId: anchorEventId,
              patch: { projectionPending: true },
            })
            .catch((markerErr) =>
              log('awaitAcpBuiltinToolChildren: could not record projection debt: %O', markerErr),
            );
        }
      }
      return {
        contractVersion,
        pendingOperationIds: allSeen ? pendingIds : wanted,
        status: 'pending',
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

/**
 * Parent-side durable inbox ACK (F06/v2 contract): the ONLY transition that
 * consumes a child-result delivery. Each eventId is bound to the calling
 * operation via `aggregateId`, so a leaked or forged id can never consume
 * another operation's receipt. Unacked receipts stay `offered` — replayable
 * after a parent crash.
 */
export const ackAcpChildResultDeliveries = async (
  deps: Pick<AcpBuiltinToolExecDeps, 'db'>,
  input: { deliveryEventIds: string[]; operationId: string },
): Promise<{ acked: string[]; ignored: string[] }> => {
  const outbox = new EventOutboxModel(deps.db);
  const acked: string[] = [];
  const ignored: string[] = [];
  for (const eventId of [...new Set(input.deliveryEventIds)].slice(0, 64)) {
    const didAck = await outbox.ackDeliveryReceiptByEventId({
      aggregateId: input.operationId,
      eventId,
    });
    if (didAck) {
      acked.push(eventId);
      continue;
    }
    // Verify the REAL receipt state before reporting a miss (SA04-A): an
    // already-`acked` receipt — the previous ack landed but its response was
    // lost — is an idempotent success, not an ignore. `ignored` is reserved
    // for ids that genuinely never resolved under this operation, so the
    // caller can treat the response as the authoritative consume state.
    const receipt = await outbox.getDeliveryReceiptState({
      aggregateId: input.operationId,
      eventId,
    });
    (receipt?.deliveryState === 'acked' ? acked : ignored).push(eventId);
  }
  return { acked, ignored };
};

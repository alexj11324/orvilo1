import { LOADING_FLAT } from '@orvilo/const';
import type { OrviloDatabase } from '@orvilo/database';
import { DeviceTransportErrorCode } from '@orvilo/device-gateway-client';
import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import {
  getNativeHeteroSessionBindingKey,
  isLocalHeterogeneousType,
  isRemoteHeterogeneousType,
} from '@orvilo/heterogeneous-agents';
import type {
  AcpBuiltinToolSpec,
  AgentRunAdmissionState,
  DeviceUnavailableErrorData,
  ErrorType,
  ExecAgentResult,
  HeterogeneousTopicPin,
  OrviloAgentAgencyConfig,
  RequestTrigger,
  WorkingDirConfig,
} from '@orvilo/types';
import {
  applyTopicModelToHeterogeneousProvider,
  buildHeteroExecArgs,
  ChatErrorType,
  getWorkingDirEffectivePath,
  resolveHeteroAgentSystemContext,
  resolveOrviloCliAgentType,
} from '@orvilo/types';
import { nanoid } from '@orvilo/utils';
import debug from 'debug';
import { eq, sql } from 'drizzle-orm';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { DeviceModel } from '@/database/models/device';
import type { MessageModel } from '@/database/models/message';
import type { TopicModel } from '@/database/models/topic';
import { agentOperations } from '@/database/schemas';
import { resolveExecutionPlan, resolveWorkspaceScoped } from '@/helpers/executionTarget';
import { signHeteroOperationJWT, signUserJWT } from '@/libs/trpc/utils/internalJwt';
import {
  createAgentStateManager,
  createStreamEventManager,
} from '@/server/modules/AgentExecution/factory';
import { CompletionLifecycle } from '@/server/services/agentExecution/CompletionLifecycle';
import { hookDispatcher } from '@/server/services/agentExecution/hooks';
import type { AgentHook } from '@/server/services/agentExecution/hooks/types';
import { deviceGateway } from '@/server/services/deviceGateway';
import { resolveDeviceDispatchAuthorizationFailure } from '@/server/services/deviceGateway/dispatchAuthorization';
import { resolveGithubAccessToken } from '@/server/services/githubRepo';
import { HeterogeneousAgentService } from '@/server/services/heterogeneousAgent';
import type { ConversationHistoryEntry } from '@/server/services/heterogeneousAgent/cloudHeteroContext';
import { buildCloudHeteroContext } from '@/server/services/heterogeneousAgent/cloudHeteroContext';
import { buildRemoteDeviceHeteroContext } from '@/server/services/heterogeneousAgent/remoteDeviceHeteroContext';
import {
  classifyRemoteDispatchFailure,
  createRemoteRunAdmission,
  loadRemoteRunRecord,
  markRemoteRunRunning,
  readRemoteRunAdmission,
  type RemoteRunChannel,
  writeRemoteRunAdmission,
} from '@/server/services/heterogeneousAgent/runAdmission';
import type { MarketService } from '@/server/services/market';

import {
  getHeterogeneousAgentTitle,
  humanizeHeteroDispatchError,
  resolveHeteroDispatchErrorType,
  supportsCloudHeterogeneousSandbox,
} from '../helpers/heteroErrors';
import { pruneRegeneratedBranch } from '../pruneRegeneratedBranch';
import { resolveDeviceWorkingDirectoryConfig } from '../resolveDeviceWorkingDirectory';
import type { ExecRunContext } from '../types';
import type { ExternalToolSurfaceEntry, ToolSurfaceOutcome } from './runToolSurface';

const log = debug('orvilo-server:ai-agent-service');

export interface HeteroDispatchDeps {
  bindTopicWorkingDirectory: (params: {
    config?: WorkingDirConfig;
    currentWorkingDirectory?: string;
    topicId: string;
  }) => Promise<void>;
  db: OrviloDatabase;
  getMarketService: () => Promise<MarketService>;
  messageModel: MessageModel;
  resolveDeviceWorkspaceId: (deviceId: string | undefined) => Promise<string | undefined>;
  topicModel: TopicModel;
  userId: string;
  withholdGatewayToken: boolean;
  workspaceId?: string;
}

/**
 * Finalize a hetero run that fails *synchronously at dispatch* — before the
 * CLI/agent process ever starts (device offline → DEVICE_NOT_FOUND, no bound
 * device, access denied, sandbox spawn rejected). These paths never produce a
 * `heteroFinish` (CLI exit) or `agentNotify` done callback, so without this
 * each one would strand the run: the assistant bubble would show an error but
 * the UI stream would never close and a long-run task would hang in `running`.
 *
 * Routes through the SAME terminal funnel a normal exit uses —
 * `CompletionLifecycle.completeOperation` finalizes the op row and fires the
 * run's onComplete/onError hooks, so the task lifecycle (onTopicComplete → task
 * failed) and any IM bot completion callback fire exactly as they would for a
 * real failure — then closes the UI stream and clears the (never-started)
 * running operation. The hooks were registered and serialized onto
 * `runningOperation` at dispatch time.
 *
 * Stream-close / hook dispatch / metadata clear are best-effort: a failure
 * there must not mask the original dispatch error the caller surfaces.
 */
const finalizeHeteroDispatchError = async (
  deps: HeteroDispatchDeps,
  params: {
    agentId?: string;
    assistantMessageId: string;
    detail: string;
    errorData?: DeviceUnavailableErrorData;
    /**
     * Client error type. Defaults to the generic `ServerAgentRuntimeError`; pass a
     * dedicated `ChatErrorType` (e.g. `DeviceGatewayNotConfigured`) so the web
     * client renders a specific localized headline instead of the generic copy.
     */
    errorType?: ErrorType;
    message: string;
    operationId: string;
    topicId: string;
  },
): Promise<void> => {
  const {
    agentId,
    assistantMessageId,
    detail,
    errorData,
    errorType = ChatErrorType.ServerAgentRuntimeError,
    message,
    operationId,
    topicId,
  } = params;

  // 1. Error bubble — written first so a stream subscriber reacting to the
  //    end event below re-reads a message that already carries the error.
  await deps.messageModel.update(assistantMessageId, {
    content: '',
    error: { body: { detail, ...errorData }, message, type: errorType },
  });

  // 1b. Finalize the run through CompletionLifecycle's single entry — the SAME
  //     owner the CLI exit (heteroFinish) / in-process paths use. It marks the
  //     agent_operations row terminal (the row was inserted at recordStart, but a
  //     dispatch failure goes through THIS path, not heteroFinish, so without
  //     finalizing it the row stays status='running' forever) AND fires the run's
  //     onComplete/onError hooks (task lifecycle → task failed + IM bot callback).
  //     `skipErrorMessageWrite` keeps the bespoke device-specific bubble written
  //     in step 1; verify is done-only, so it no-ops on this error path.
  await new CompletionLifecycle(deps.db, deps.userId, deps.workspaceId).completeOperation(
    {
      agentId,
      assistantMessageId,
      error: { message, type: errorType },
      operationId,
      serializedHooks: hookDispatcher.getSerializedHooks(operationId),
      topicId,
      userId: deps.userId,
    },
    'error',
    { skipErrorMessageWrite: true },
  );

  // 2. Close the UI stream.
  try {
    await createStreamEventManager().publishAgentRuntimeEnd({
      finalState: { error: detail },
      operationId,
      reason: 'error',
      reasonDetail: detail,
      stepIndex: 0,
    });
  } catch (err) {
    log('finalizeHeteroDispatchError: publishAgentRuntimeEnd failed (non-fatal): %O', err);
  }

  // 3. The operation never started — settle the topic so reconnect /
  //    heteroIngest validation and the next turn don't see a stale operation.
  //    Settle, not take: dropping the marker alone would strand `status` on
  //    'running' with nothing left for any later settle to match — see
  //    `ServerOperationStore.clearRunningMark`. 'active' rather than 'unread'
  //    because a dispatch that never started produced nothing to read.
  try {
    await deps.topicModel.settleRunningOperation(topicId, operationId, 'active');
  } catch (err) {
    log('finalizeHeteroDispatchError: clear runningOperation failed (non-fatal): %O', err);
  }
};

/**
 * Liveness probe for the ONE dispatch failure that races a live run: the cloud
 * sandbox `runCommand` call (see the `spawnHeteroSandbox` catch below). Every
 * other `finalizeHeteroDispatchError` caller rejects synchronously, before any
 * agent process can exist, so none of them needs this.
 *
 * `runCommand` is issued with `background: true` and is supposed to return as
 * soon as the command is handed to the sandbox — but the sandbox gateway can
 * sit on the connection and answer `Gateway Timeout` a minute or more later,
 * long after the sandbox actually booted and started streaming events back
 * through `heteroIngest`. Finalizing on that rejection blindly treats a
 * transient gateway 504 as "the run never started": it blanks the assistant
 * message, stamps an error bubble on a turn the user already read, marks the
 * op row + its task failed, and closes the UI stream out from under a run that
 * is still producing output.
 *
 * Three cheap reads tell a stranded dispatch apart from a live one:
 *
 * 1. `agent_operations.status` — anything other than `running` means the run
 *    reached `heteroFinish` (or a park) on its own. Nothing left to finalize.
 * 2. `topics.metadata.heteroCurrentMsgId` — the ingest path repoints this at
 *    every assistant turn it persists, scoped by `operationId`. It naming THIS
 *    operation is proof the sandbox is alive and writing.
 * 3. `agent_operations.metadata.remoteAdmission.state === 'running'` — the
 *    same evidence as (2) for notify-based remote agents that never repoint
 *    `heteroCurrentMsgId`.
 *
 * When neither fires the sandbox really never came up and the caller finalizes
 * as before. A run that passes this probe and then dies is not stranded: the
 * agent-gateway inactivity watchdog still reaps it through `finalizeAbandoned`.
 */
const hasHeteroRunStarted = async (
  deps: HeteroDispatchDeps,
  params: { operationId: string; topicId: string },
): Promise<boolean> => {
  const { operationId, topicId } = params;

  try {
    const operation = await new AgentOperationModel(
      deps.db,
      deps.userId,
      deps.workspaceId,
    ).findById(operationId);

    if (operation && operation.status !== 'running') {
      log(
        'hasHeteroRunStarted: op=%s already settled (status=%s) — skipping spawn-failure finalize',
        operationId,
        operation.status,
      );
      return true;
    }

    const topic = await deps.topicModel.findById(topicId);
    if (topic?.metadata?.heteroCurrentMsgId?.operationId === operationId) {
      log(
        'hasHeteroRunStarted: op=%s has ingested turns — skipping spawn-failure finalize',
        operationId,
      );
      return true;
    }

    // The admission ledger is the third probe: a producer batch already flipped
    // it to `running` (see markRemoteRunRunning in heteroIngest), which is the
    // same evidence as heteroCurrentMsgId for notify-based remote agents that
    // never write that pointer.
    const admission = readRemoteRunAdmission(operation?.metadata);
    if (admission?.state === 'running') {
      log(
        'hasHeteroRunStarted: op=%s admission already running — skipping spawn-failure finalize',
        operationId,
      );
      return true;
    }

    return false;
  } catch (err) {
    // A probe that cannot read must not swallow a real spawn failure: fall
    // back to the pre-existing behaviour and finalize.
    log(
      'hasHeteroRunStarted: probe failed for op=%s (treating as not started): %O',
      operationId,
      err,
    );
    return false;
  }
};

/**
 * Mint the admission record for a remote dispatch BEFORE the gateway call so
 * a crash mid-dispatch still leaves a durable `pending` intent. Idempotent:
 * the same operationId can only ever create one record.
 *
 * Ledger fields pin the contract identities: `idempotencyKey` is the
 * operationId (which is also the task id the device dedupes on), `generation`
 * is the run fence (1 for the first admission of an operation), and the
 * device triple records the exact execution host so cancel/status always
 * address the same device — never a substitute.
 */
const writeDispatchAdmission = async (
  deps: HeteroDispatchDeps,
  params: {
    channel: RemoteRunChannel;
    deviceId?: string;
    deviceUserId?: string;
    deviceWorkspaceId?: string;
    operationId: string;
  },
): Promise<void> => {
  try {
    await createRemoteRunAdmission(deps.db, params.operationId, {
      channel: params.channel,
      deviceId: params.deviceId,
      deviceUserId: params.deviceUserId,
      deviceWorkspaceId: params.deviceWorkspaceId,
      generation: 1,
      idempotencyKey: params.operationId,
    });
  } catch (err) {
    // The admission write is the audit trail, not the dispatch gate — the
    // operation row (recordStart) is already the durable intent, so a ledger
    // hiccup must not block an otherwise healthy dispatch.
    log('writeDispatchAdmission failed op=%s (non-fatal): %O', params.operationId, err);
  }
};

/**
 * Settle the admission ledger after a remote dispatch call and classify what
 * the caller may do next:
 *
 * - `'acknowledged'` — the gateway/host accepted the run, or the failure was
 *   ambiguous but the liveness probe proves it is already producing events.
 *   The caller continues to the normal `autoStarted` success return.
 * - `'terminal'` — a definite refusal (offline device, rejected request,
 *   unauthorized): nothing ran. The caller finalizes through
 *   `finalizeHeteroDispatchError` exactly as before.
 * - `'unknown'` — the ack was lost and no sign of life: the operation row,
 *   topic marker and stream stay OPEN so a device that is in fact running can
 *   still deliver its events; the caller returns `success:false` +
 *   `error:'OUTCOME_UNKNOWN'` instead of a fabricated failure. This is the
 *   P20 fix for the zombie-run hazard: the old code finalized every dispatch
 *   failure, which could leave a live device writing into a settled marker.
 */
const settleRemoteDispatchOutcome = async (
  deps: HeteroDispatchDeps,
  params: {
    error?: string;
    errorCode?: string;
    operationId: string;
    success: boolean;
    topicId: string;
  },
): Promise<{
  admissionState: AgentRunAdmissionState;
  outcome: 'acknowledged' | 'terminal' | 'unknown';
}> => {
  const { errorCode, operationId, topicId } = params;

  if (params.success) {
    await writeRemoteRunAdmission(deps.db, operationId, { state: 'acknowledged' }).catch((err) =>
      log('remoteAdmission acknowledged write failed op=%s: %O', operationId, err),
    );
    return { admissionState: 'acknowledged', outcome: 'acknowledged' };
  }

  // No transport code means the device produced an authoritative answer
  // (explicit rejection / tool failure) — definite, not ambiguous.
  const admissionState = errorCode ? classifyRemoteDispatchFailure(errorCode) : 'rejected';
  const failureWriteApplied = await writeRemoteRunAdmission(deps.db, operationId, {
    errorCode: errorCode ?? params.error,
    reason: params.error,
    state: admissionState,
  }).catch((err) => {
    log('remoteAdmission failure write failed op=%s: %O', operationId, err);
    return false;
  });

  if (admissionState !== 'unknown') {
    if (failureWriteApplied) return { admissionState, outcome: 'terminal' };

    // The guarded write was refused: the ledger is already ahead of this
    // failure signal — either a producer callback already proved liveness
    // (running/acknowledged — this failure is stale and must NOT finalize the
    // run) or a terminal verdict was already recorded (idempotent).
    const record = await loadRemoteRunRecord(deps.db, operationId).catch((err) => {
      log('remoteAdmission re-read failed op=%s: %O', operationId, err);
      return undefined;
    });
    const currentState = record?.admission?.state;
    if (currentState === 'running' || currentState === 'acknowledged') {
      log(
        'remoteAdmission failure signal dropped op=%s — ledger already %s',
        operationId,
        currentState,
      );
      return { admissionState: currentState, outcome: 'acknowledged' };
    }
    if (currentState === 'rejected' || currentState === 'offline') {
      return { admissionState: currentState, outcome: 'terminal' };
    }
    if (currentState === 'unknown') {
      // An ambiguous signal was already recorded — keep the run open.
      return { admissionState: 'unknown', outcome: 'unknown' };
    }
    // Record missing or unreadable: the transport still gave a DEFINITE
    // answer (`rejected`/`offline` — nothing launched), and no ledger state
    // contradicts it. Treat as terminal rather than parking the run on an
    // admission that may not even exist.
    return { admissionState, outcome: 'terminal' };
  }

  if (await hasHeteroRunStarted(deps, { operationId, topicId })) {
    await markRemoteRunRunning(deps.db, operationId).catch((err) =>
      log('remoteAdmission running write failed op=%s: %O', operationId, err),
    );
    return { admissionState: 'running', outcome: 'acknowledged' };
  }

  return { admissionState: 'unknown', outcome: 'unknown' };
};

export interface HeteroDispatchInput {
  /**
   * Runs inside the operation's commit window — after the id is minted,
   * before the durable row exists. Task runners use it to revalidate their
   * reservation and bind the operationId transactionally; the post-return
   * registration path covers callers that don't.
   */
  beforeOperationStart?: (input: { operationId: string; topicId: string }) => Promise<void>;
  /**
   * Server-backed builtin tools resolved for this run. The execution host
   * (desktop, device daemon, cloud sandbox) mounts each spec on its per-run
   * MCP server; invocations call back to the server with the operation JWT.
   */
  builtinToolSpecs?: AcpBuiltinToolSpec[];
  canManageAgent: boolean;
  /** Source attribution persisted onto the operation row's appContext. */
  clientIp?: string;
  effectiveRequestedDeviceId?: string;
  /**
   * External (connector / installed-plugin MCP) tools mounted on the same
   * per-run MCP surface — persisted on the operation as
   * `metadata.externalTools` (identifier → api names + source only) so the
   * `execBuiltinTool` callback re-resolves credentials at call time and keeps
   * them out of operation metadata entirely.
   */
  externalToolMounts?: Record<string, ExternalToolSurfaceEntry>;
  /**
   * Extra caller-supplied context appended after the persona/provider system
   * context (e.g. eval `envPrompt`). Replaces the legacy `evalContext` channel
   * that the retired server-side loop consumed during operation prep.
   */
  extraSystemContext?: string;
  heterogeneousProvider?: OrviloAgentAgencyConfig['heterogeneousProvider'];
  heteroType: HeterogeneousAgentType;
  hooks?: AgentHook[];
  isPublicWorkspaceAgent: boolean;
  localDeviceId?: string;
  maxSteps?: number;
  memberDeviceOverride?: Pick<OrviloAgentAgencyConfig, 'boundDeviceId' | 'executionTarget'>;
  operationTaskId?: string;
  parentOperationId?: string;
  pinnedHeterogeneousTopicModel?: HeterogeneousTopicPin;
  requestedDeviceId?: string;
  requestTrigger?: RequestTrigger;
  runAttachments: { imageList?: Array<{ alt: string; id: string; url: string }> };
  /** Ids of the rows THIS turn just persisted (excluded from recovery history). */
  selfMessageIds: Set<string>;
  skipTaskVerification?: boolean;
  /**
   * Per-tool mount outcomes from `resolveRunToolSurface` — persisted into the
   * operation's metadata so a mounted/unsupported/unauthorized/failed record
   * survives the debug log into traces.
   */
  toolSurfaceOutcomes?: ToolSurfaceOutcome[];
  topicStartOwnerOperationId?: string;
  /** Source attribution persisted onto the operation row's appContext. */
  userAgent?: string;
}

/**
 * Stage 3.5 of {@link AiAgentService.execAgent}: heterogeneous-agent early
 * exit. Local CLI and remote platform agents bypass the server-side LLM
 * pipeline — after topic + message creation we hand off to the device gateway
 * (desktop) or cloud sandbox, which will push events back via `heteroIngest` /
 * `heteroFinish` (amp / claude-code / codebuddy / codex / cursor / droid /
 * grok-build / kimi-code / opencode / pi / qoder / trae) or
 * `agentNotify.notify` (openclaw / hermes).
 *
 * Always returns a terminal {@link ExecAgentResult} — the caller's `execAgent`
 * returns it directly and never continues to the normal-agent stages.
 */
export const dispatchHeteroAgent = async (
  deps: HeteroDispatchDeps,
  ctx: ExecRunContext,
  input: HeteroDispatchInput,
): Promise<ExecAgentResult> => {
  const {
    agentConfig,
    appContext,
    assistantMessageId,
    canUseDevice,
    deviceAccessReason,
    parentMessageId,
    persistAgentId,
    prompt,
    resolvedAgentId,
    topicId,
    trigger,
    userMessageId,
  } = ctx;
  const {
    beforeOperationStart,
    builtinToolSpecs,
    canManageAgent,
    externalToolMounts,
    toolSurfaceOutcomes,
    clientIp,
    effectiveRequestedDeviceId,
    extraSystemContext,
    heteroType,
    heterogeneousProvider,
    hooks,
    isPublicWorkspaceAgent,
    localDeviceId,
    maxSteps,
    memberDeviceOverride,
    operationTaskId,
    parentOperationId,
    pinnedHeterogeneousTopicModel,
    requestTrigger,
    requestedDeviceId,
    runAttachments,
    selfMessageIds,
    skipTaskVerification,
    topicStartOwnerOperationId,
    userAgent,
  } = input;

  const isRemoteHetero = isRemoteHeterogeneousType(heteroType);
  // Builtin Orvilo harness: `heteroType` keeps the declared identity for
  // metadata and hooks, but every CLI-family concern — `lh hetero exec --type`,
  // adapter/error classification, sandbox support, resume binding — resolves to
  // the selected engine's family. There is no `orvilo` executable or ingest
  // schema entry, so anything reaching a device or sandbox must carry the
  // family type and family-encoded args.
  const heteroCliAgentType =
    heteroType === 'orvilo' ? resolveOrviloCliAgentType(heterogeneousProvider?.engine) : heteroType;
  // Same structured shape as the built-in path (`op_{ts}_{agentId}_{topicId}_{rand}`)
  // so hetero ops aren't visually distinct bare nanoids in the trace/op tables.
  const operationId = `op_${Date.now()}_${resolvedAgentId}_${topicId}_${nanoid(8)}`;

  // Hooks belong to this operation's lifecycle. Persist their serializable
  // form on the durable operation row before dispatch; runningOperation below
  // remains a compatibility mirror for older terminal consumers.
  if (hooks?.length) hookDispatcher.register(operationId, hooks);
  const serializedHooks = hookDispatcher.getSerializedHooks(operationId);

  // Caller persistence (taskRunner's reservation revalidation + operation
  // registration) runs in the commit window — after the id is minted, before
  // the durable row exists, same slot the retired loop's startOperation used.
  try {
    await beforeOperationStart?.({ operationId, topicId });
  } catch (error) {
    hookDispatcher.unregister(operationId);
    throw error;
  }

  // Persist a first-class agent_operations row for the hetero run. The id is
  // generated here (authoritative) and flows through to heteroIngest /
  // heteroFinish unchanged. Without this row the run is invisible to the
  // operation lifecycle: verify (ensureForOperation), repair (parent chain),
  // judge (op.model/provider) and tracing all key off it. The durable row is
  // also an authentication prerequisite: every callback
  // re-authorizes its operation token against this exact principal. Do not
  // mint a token or dispatch/spawn when persistence fails.
  const operationPersisted = await new CompletionLifecycle(
    deps.db,
    deps.userId,
    deps.workspaceId,
  ).recordStart({
    agentId: persistAgentId,
    appContext: { ...appContext, clientIp, sourceMessageId: userMessageId, userAgent },
    chatGroupId: appContext?.groupId ?? null,
    // Engine provenance: the heterogeneous/ACP dispatch — never the in-process
    // runtime loop — owns this operation. `heteroAgentType` records the CLI
    // family actually spawned (`orvilo` resolves to its engine's family), so a
    // trace can prove which adapter drove the run.
    executionEngine: 'hetero',
    maxSteps,
    metadata: {
      _hooks: serializedHooks,
      assistantMessageId,
      // Server-executed builtin tool allowlist for this run (P70c): the
      // `execBuiltinTool` callback rejects any identifier/apiName outside
      // this map, so a captured operation token cannot reach runtimes the
      // dispatch-time tool surface never resolved.
      ...(builtinToolSpecs?.length
        ? {
            builtinTools: Object.fromEntries(
              builtinToolSpecs.map((spec) => [spec.identifier, spec.apis.map((api) => api.name)]),
            ),
          }
        : {}),
      heteroAgentType: heteroCliAgentType,
      // Per-tool mount contract for this run — mounted/unsupported/
      // unauthorized/failed with reasons, so a degraded surface is
      // inspectable from the operation record instead of a lost debug log.
      ...(toolSurfaceOutcomes?.length
        ? {
            toolSurface: Object.fromEntries(
              toolSurfaceOutcomes.map((o) => [
                o.identifier,
                { kind: o.kind, reason: o.reason, status: o.status },
              ]),
            ),
          }
        : {}),
      // External mounts share the builtin-tool callback wire but re-resolve
      // their connection (fresh OAuth token / customParams.mcp) on each call —
      // persist only api names + source, never transport params or secrets.
      ...(externalToolMounts && Object.keys(externalToolMounts).length
        ? {
            externalTools: Object.fromEntries(
              Object.entries(externalToolMounts).map(([identifier, entry]) => [
                identifier,
                { apis: entry.apis.map((api) => api.name), source: entry.source },
              ]),
            ),
          }
        : {}),
    },
    operationId,
    parentOperationId,
    provider: heteroType,
    skipTaskVerification,
    taskId: operationTaskId ?? null,
    threadId: appContext?.threadId ?? null,
    topicId,
    trigger,
  });
  if (!operationPersisted) {
    hookDispatcher.unregister(operationId);
    throw new Error('Failed to persist heterogeneous agent operation');
  }

  // Read resume session id for next-turn continuity.
  const heteroService = new HeterogeneousAgentService(deps.db, deps.userId, {
    workspaceId: deps.workspaceId,
  });
  const resumeSessionId = await heteroService.getHeterogeneousResumeSessionId(
    topicId,
    getNativeHeteroSessionBindingKey(heteroCliAgentType),
  );
  // Sign an operation-scoped JWT so the CLI can authenticate against
  // heteroIngest / heteroFinish without full user credentials.
  let operationJwt: string;
  try {
    operationJwt = await signHeteroOperationJWT({
      capabilities: [
        'hetero:ingest',
        'hetero:finish',
        'hetero:intervention:read',
        // Only granted when the run actually mounts builtin tools — the
        // `execBuiltinTool` endpoint rejects the capability otherwise.
        ...(builtinToolSpecs?.length ? (['hetero:tool:exec'] as const) : []),
      ],
      operationId,
      userId: deps.userId,
      workspaceId: deps.workspaceId,
    });
  } catch (err) {
    log('execAgent: failed to sign operation JWT for hetero run: %O', err);
    throw new Error('Failed to sign operation JWT for hetero agent', { cause: err });
  }

  // Read repos from topic metadata for sandbox setup (web/cloud only).
  const topic = await deps.topicModel.findById(topicId);
  const topicRepos: string[] = topic?.metadata?.repos ?? [];

  // Resolve GitHub OAuth token for the sandbox. Always attempt so CC can use
  // git / gh CLI even when no repos are pre-selected. Falls back to the
  // standard 'github' key (Orvilo OAuth connector default); agent config can
  // override via GITHUB_CRED_KEY.
  const githubToken = await resolveGithubAccessToken({
    credKey: agentConfig.agencyConfig?.heterogeneousProvider?.env?.GITHUB_CRED_KEY ?? 'github',
    db: deps.db,
    // A failing getMarketService must not kill the run — the helper tolerates
    // a missing one and falls back to its own construction.
    marketService: await deps.getMarketService().catch(() => undefined),
    userId: deps.userId,
    workspaceId: deps.workspaceId,
  });

  // Recovery history is reserved for the CLI's retry without native resume.
  // The primary resumed attempt already has native history and must not get
  // a serialized duplicate. Amp threads are server-backed, so they rely on
  // native continuation exclusively and never need this local-file fallback.
  let conversationHistory: ConversationHistoryEntry[] | undefined;
  if (heteroType !== 'amp') {
    try {
      // `allowShareVisitor`: this is the RUN's own topic, already resolved
      // and authorized upstream. An agent-share visitor run executes under
      // the creator's identity, so without the opt-in `query()`'s
      // creator-facing default would hand the agent an empty history.
      let recentMsgs = await deps.messageModel.query(
        { topicId, pageSize: 200 },
        { allowShareVisitor: true },
      );
      // A resume/regenerate run anchors on `parentMessageId`: the flat topic
      // query still contains the anchor's old answer branch (and, for a
      // middle-turn regenerate, the later turns that continued from it). Drop
      // that branch — including members hidden inside compaction groups — or
      // the CLI would "continue" an already-answered turn.
      if (parentMessageId) {
        const tree = await deps.messageModel.queryTopicMessageTree({ topicId });
        recentMsgs = pruneRegeneratedBranch(recentMsgs, tree, parentMessageId);
      }
      const turns = recentMsgs
        .filter(
          (m) =>
            (m.role === 'user' || m.role === 'assistant') &&
            !m.threadId &&
            !selfMessageIds.has(m.id) &&
            m.content &&
            m.content !== LOADING_FLAT,
        )
        .slice(-30)
        .map((m) => ({
          content: m.content ?? '',
          role: m.role as 'assistant' | 'user',
        }));
      if (turns.length > 0) conversationHistory = turns;
    } catch (err) {
      log('execAgent: failed to load conversation history for hetero context: %O', err);
    }
  }

  // Build the primary context without conversation history. If native resume
  // fails, the CLI switches to the complete fallback prompt on its fresh
  // retry; successful same-session runs never consume the duplicate history.
  // For the builtin Orvilo harness the agent's `systemRole` persona leads the
  // injected context — external CLI harnesses keep their own identity.
  const agentSystemContext =
    [
      resolveHeteroAgentSystemContext(heterogeneousProvider, agentConfig.systemRole),
      extraSystemContext?.trim(),
    ]
      .filter(Boolean)
      .join('\n\n') || undefined;
  const systemContext = buildCloudHeteroContext({
    agentSystemContext,
    conversationHistory: resumeSessionId ? undefined : conversationHistory,
    githubToken,
    repos: topicRepos,
  });
  const resumeFallbackSystemContext =
    resumeSessionId && conversationHistory
      ? buildCloudHeteroContext({
          agentSystemContext,
          conversationHistory,
          githubToken,
          repos: topicRepos,
        })
      : undefined;

  // Feed the resolved images (signed URLs) to the dispatched CLI for vision —
  // mirrors the local-mode path, where the client feeds the persisted
  // message's imageList into `sendPrompt`. Reuses the shared resolution above
  // so bot/IM and SPA gateway attachments are handled identically.
  const heteroImageList =
    runAttachments.imageList && runAttachments.imageList.length > 0
      ? runAttachments.imageList.map((image) => ({ id: image.id, url: image.url }))
      : undefined;
  const effectiveHeterogeneousProvider =
    heterogeneousProvider?.type === heteroType
      ? applyTopicModelToHeterogeneousProvider(heterogeneousProvider, pinnedHeterogeneousTopicModel)
      : undefined;
  const heteroExecArgs = isLocalHeterogeneousType(heteroCliAgentType)
    ? buildHeteroExecArgs(
        effectiveHeterogeneousProvider
          ? { ...effectiveHeterogeneousProvider, type: heteroCliAgentType }
          : { type: heteroCliAgentType },
      )
    : undefined;

  const heteroParams = {
    // Devices and sandboxes receive the CLI family — their `lh hetero exec`
    // may predate `--type orvilo` support.
    agentType: heteroCliAgentType,
    assistantMessageId,
    builtinTools: builtinToolSpecs?.length ? builtinToolSpecs : undefined,
    githubToken,
    imageList: heteroImageList,
    jwt: operationJwt,
    operationId,
    prompt,
    repos: topicRepos,
    resumeFallbackSystemContext,
    resumeSessionId,
    systemContext,
    topicId,
    userId: deps.userId,
  };

  const platformPlan = isRemoteHetero
    ? resolveExecutionPlan({
        agencyConfig: agentConfig.agencyConfig,
        canUseDevice,
        clientExecutionAvailable: Boolean(localDeviceId),
        isHetero: true,
        localDeviceId,
        requestedDeviceId: effectiveRequestedDeviceId,
        sandboxExecutionAvailable: false,
        trigger: requestTrigger,
        workspaceScoped: resolveWorkspaceScoped(
          isPublicWorkspaceAgent && !canManageAgent,
          memberDeviceOverride,
        ),
      })
    : undefined;
  const remoteDeviceId = platformPlan?.kind === 'device' ? platformPlan.deviceId : undefined;
  const remoteDeviceWorkspaceId = remoteDeviceId
    ? await deps.resolveDeviceWorkspaceId(remoteDeviceId)
    : undefined;
  const usesCallersPersonalDevice =
    platformPlan?.kind === 'device' &&
    !remoteDeviceWorkspaceId &&
    (effectiveRequestedDeviceId === remoteDeviceId ||
      (platformPlan.target === 'local' &&
        agentConfig.agencyConfig?.executionTargetSelectionPolicy !== 'fixed') ||
      (!canManageAgent && memberDeviceOverride?.boundDeviceId === remoteDeviceId));
  const remoteDeviceUserId = usesCallersPersonalDevice
    ? deps.userId
    : (agentConfig.userId ?? deps.userId);

  // Resolve CLI-device routing before persisting the marker. Cancellation
  // must address the same device even though local CLI agents use a different
  // dispatch transport from notify-based platform agents.
  const deviceHeteroPlan = !isRemoteHetero
    ? resolveExecutionPlan({
        agencyConfig: agentConfig.agencyConfig,
        canUseDevice,
        isHetero: true,
        clientExecutionAvailable: false,
        requestedDeviceId,
        sandboxExecutionAvailable: supportsCloudHeterogeneousSandbox(
          heteroType,
          heterogeneousProvider?.engine,
        ),
        trigger: requestTrigger,
      })
    : undefined;
  const cliDeviceId = deviceHeteroPlan?.kind === 'device' ? deviceHeteroPlan.deviceId : undefined;
  const cliDeviceWorkspaceId = cliDeviceId
    ? await deps.resolveDeviceWorkspaceId(cliDeviceId)
    : undefined;

  // Register the run's lifecycle hooks so the hetero terminal path fires
  // onComplete/onError through the same `hookDispatcher` the normal LLM
  // runtime uses — driving the task lifecycle (onTopicComplete) and IM bot
  // completion callbacks uniformly. The hetero block returns before
  // AgentRuntimeService (which registers hooks for normal runs), so we do it
  // here. Local mode dispatches these in-memory handlers; queue mode delivers
  // the serialized webhooks persisted on the operation row above.
  // Seed topic.metadata.runningOperation so heteroIngest can validate the
  // operation, and so every terminal site (heteroFinish, agentNotify done,
  // dispatch failure) can re-fire the serialized hooks across a process
  // boundary in queue mode.
  const childOperation = {
    assistantMessageId,
    heteroType,
    hooks: serializedHooks,
    startedAt: new Date().toISOString(),
    ...(isRemoteHetero && remoteDeviceId
      ? {
          deviceId: remoteDeviceId,
          deviceUserId: remoteDeviceUserId,
          deviceWorkspaceId: remoteDeviceWorkspaceId,
        }
      : cliDeviceId
        ? {
            deviceId: cliDeviceId,
            deviceUserId: deps.userId,
            deviceWorkspaceId: cliDeviceWorkspaceId,
          }
        : {}),
    operationId,
    orchestrationRole: appContext?.orchestrationRole,
    scope: appContext?.scope ?? undefined,
    threadId: appContext?.threadId ?? undefined,
  };
  if (topicStartOwnerOperationId) {
    const attached = await deps.topicModel.appendRunningOperationChild(
      topicId,
      topicStartOwnerOperationId,
      childOperation,
    );
    if (!attached) {
      const message = 'Group supervisor finished before this member could start.';
      await new CompletionLifecycle(deps.db, deps.userId, deps.workspaceId).completeOperation(
        {
          agentId: persistAgentId,
          assistantMessageId,
          error: { message, type: 'AgentRuntimeError' },
          operationId,
          orchestrationRole: appContext?.orchestrationRole,
          serializedHooks,
          topicId,
          userId: deps.userId,
        },
        'error',
      );
      return {
        agentId: resolvedAgentId,
        assistantMessageId,
        autoStarted: false,
        createdAt: new Date().toISOString(),
        error: message,
        message,
        operationId,
        status: 'error',
        success: false,
        timestamp: new Date().toISOString(),
        topicId,
        userMessageId: userMessageId ?? parentMessageId ?? '',
      };
    }
  } else if (appContext?.isolationThread && parentOperationId) {
    // Isolation-thread children (callAgent / callSubAgent) run on the
    // SPAWNER's topic and finish long before it does. heteroIngest and
    // heteroFinish both require this child's operationId to resolve via
    // topic.metadata.runningOperation (root or childOperations) — see
    // the comment above childOperation — or every streamed batch is
    // dropped as stale and the terminal onComplete hooks (including the
    // callAgent resume bridge) never fire. Nest under the parent's own
    // marker instead of claiming the topic-level root outright, so the
    // parent's marker survives for the rest of its still-running turn.
    const attachedToParent = await deps.topicModel.appendRunningOperationChild(
      topicId,
      parentOperationId,
      childOperation,
    );
    if (!attachedToParent) {
      // Parent isn't (or is no longer) the topic's current root marker —
      // e.g. a nested isolation chain, or the parent already settled.
      // Fall back to claiming the marker directly so this child is still
      // discoverable by its own operationId, rather than permanently
      // unrecognized by heteroIngest/heteroFinish.
      await deps.topicModel.updateMetadata(topicId, { runningOperation: childOperation });
    }
  } else if (!appContext?.isolationThread) {
    await deps.topicModel.updateMetadata(topicId, { runningOperation: childOperation });
  }

  // Always persist operation metadata (userId/workspaceId) to the state
  // manager, not just for topic-owner-mirrored runs. `subAgentCallback`
  // (the QStash-delivered completion bridge for callAgent/callSubAgent
  // children) resolves `userId` from this same store to authorize
  // resuming the parent — without it, a hetero child spawned via
  // callAgent has no metadata row, the callback 401s, and the parent
  // operation is never resumed (stays parked until the inactivity
  // watchdog abandons it).
  const persistOperationMetadata = async () => {
    try {
      await createAgentStateManager().createOperationMetadata(operationId, {
        ...(topicStartOwnerOperationId && {
          mirrorToOperationId: topicStartOwnerOperationId,
        }),
        userId: deps.userId,
        workspaceId: deps.workspaceId,
      });
    } catch (err) {
      log('execAgent: failed to persist hetero operation metadata: %O', err);
    }
  };

  // Notify-based platform agents (openclaw / hermes) communicate back via
  // agentNotify.notify. A local run uses the requesting desktop's device ID;
  // a remote run uses agencyConfig.boundDeviceId. Both use the gateway transport,
  // so open the stream before the first notify arrives.

  if (isRemoteHetero) {
    // Platform task agents require either this desktop or a connected device — there is no sandbox to
    // degrade to, so a denied sender (external bot user) is refused
    // outright instead of reaching the owner's machine.
    if (!canUseDevice) {
      log(
        'execAgent: device access denied for remote hetero dispatch (reason=%s)',
        deviceAccessReason,
      );
      await finalizeHeteroDispatchError(deps, {
        agentId: resolvedAgentId,
        assistantMessageId,
        detail: 'This sender is not allowed to run agents on a bound device.',
        message: 'Device access denied',
        operationId,
        topicId,
      });
      return {
        agentId: resolvedAgentId,
        assistantMessageId,
        autoStarted: false,
        createdAt: new Date().toISOString(),
        error: 'Device access denied',
        message: 'Remote hetero agent requires device access',
        operationId,
        status: 'error',
        success: false,
        timestamp: new Date().toISOString(),
        topicId,
        userMessageId: userMessageId ?? parentMessageId ?? '',
      };
    }
    if (!remoteDeviceId) {
      log('execAgent: openclaw/hermes requires a local or connected device');
      await finalizeHeteroDispatchError(deps, {
        agentId: resolvedAgentId,
        assistantMessageId,
        detail: 'No local or connected device is available for this agent.',
        message: 'No execution device for platform agent',
        operationId,
        topicId,
      });
      return {
        agentId: resolvedAgentId,
        assistantMessageId,
        autoStarted: false,
        createdAt: new Date().toISOString(),
        error: 'No bound device',
        message: 'Platform agent requires a local or connected device',
        operationId,
        status: 'error',
        success: false,
        timestamp: new Date().toISOString(),
        topicId,
        userMessageId: userMessageId ?? parentMessageId ?? '',
      };
    }

    // Open the stream channel so the gateway WS subscription can receive
    // notify_update events published by agentNotify.notify.
    await persistOperationMetadata();
    const streamManager = createStreamEventManager();
    await streamManager
      .publishAgentRuntimeInit(operationId, {
        agentId: resolvedAgentId,
        assistantMessageId,
        heteroType,
        mirrorToOperationId: topicStartOwnerOperationId,
        topicId,
        userId: deps.userId,
      })
      .catch((err) => log('execAgent: failed to init stream for remote hetero: %O', err));

    // lh connect only handles tool_call_request (not agent_run_request),
    // so we use executeToolCall with the runHeteroTask tool instead of dispatchAgentRun.
    const authorizationError = await resolveDeviceDispatchAuthorizationFailure(
      deps.db,
      deps.userId,
      remoteDeviceId,
      remoteDeviceWorkspaceId,
    );

    // Durable admission BEFORE the dispatch: the record survives a crash or a
    // lost ack, carries the idempotency key (operationId = the device-side
    // taskId) and the exact execution-host binding for later cancel/status.
    await writeDispatchAdmission(deps, {
      channel: 'tool_call',
      deviceId: remoteDeviceId,
      deviceUserId: remoteDeviceUserId,
      deviceWorkspaceId: remoteDeviceWorkspaceId,
      operationId,
    });

    const result = authorizationError
      ? {
          content: 'The workspace device is no longer registered or visible for this run.',
          error: 'DEVICE_NOT_FOUND',
          errorCode: DeviceTransportErrorCode.DeviceNotFound,
          errorData: authorizationError,
          success: false,
        }
      : await deviceGateway.executeToolCall(
          {
            deviceId: remoteDeviceId,
            userId: remoteDeviceUserId,
            workspaceId: remoteDeviceWorkspaceId,
          },
          {
            apiName: 'runHeteroTask',
            arguments: JSON.stringify({
              agentId: resolvedAgentId,
              agentType: heteroType,
              cwd: undefined,
              idempotencyKey: operationId,
              operationId,
              parentOperationId: topicStartOwnerOperationId,
              platformAgentId: agentConfig.agencyConfig?.heterogeneousProvider?.platformAgentId,
              prompt,
              runGeneration: 1,
              taskId: operationId,
              topicId,
              // Scope notify callbacks to the same workspace as the dispatched
              // topic so agentNotify can resolve the workspace-owned topic.
              // Without this the device's notify call falls back to personal
              // mode and TopicModel.findById returns NOT_FOUND.
              workspaceId: deps.workspaceId,
            }),
            identifier: 'runHeteroTask',
          },
          120_000, // hetero tasks can take longer than the default 30 s
        );
    const dispatchOutcome = await settleRemoteDispatchOutcome(deps, {
      error: result.error,
      errorCode: result.errorCode,
      operationId,
      success: result.success,
      topicId,
    });
    if (dispatchOutcome.outcome === 'unknown') {
      // Ambiguous ack: the request may have reached the device — a 120 s tool
      // timeout does NOT prove the task never launched, and the notify
      // callbacks would still arrive. Keep the operation row, topic marker and
      // stream open so they can land, and return an IN-PROGRESS result
      // (`success: true` + `status: 'unknown'` + `remoteAdmission: 'unknown'`)
      // so consumers keep the run live instead of terminalizing a possibly-
      // running host. The watchdog reaps a truly dead admission.
      log(
        'execAgent: remote hetero dispatch outcome unknown (device may be running) op=%s error=%s',
        operationId,
        result.error,
      );
      return {
        agentId: resolvedAgentId,
        assistantMessageId,
        autoStarted: true,
        createdAt: new Date().toISOString(),
        errorData: result.errorData,
        heteroType,
        message:
          'Dispatch acknowledgement was lost; the run may still be executing on the device. Do not retry the same operation.',
        operationId,
        remoteAdmission: 'unknown',
        status: 'unknown',
        success: true,
        timestamp: new Date().toISOString(),
        token: deps.withholdGatewayToken
          ? undefined
          : await signUserJWT(deps.userId).catch(() => undefined),
        topicId,
        userMessageId: userMessageId ?? parentMessageId ?? '',
      };
    }
    if (dispatchOutcome.outcome === 'terminal') {
      log('execAgent: remote hetero dispatch failed: %s', result.error);
      await finalizeHeteroDispatchError(deps, {
        agentId: resolvedAgentId,
        assistantMessageId,
        detail: result.error ?? 'Device dispatch failed',
        errorData: result.errorData,
        errorType: resolveHeteroDispatchErrorType(result.error),
        message: humanizeHeteroDispatchError(result.error),
        operationId,
        topicId,
      });
      return {
        agentId: resolvedAgentId,
        assistantMessageId,
        autoStarted: false,
        createdAt: new Date().toISOString(),
        error: result.error,
        errorData: result.errorData,
        message: 'Remote hetero agent dispatch failed',
        operationId,
        remoteAdmission: dispatchOutcome.admissionState,
        status: 'error',
        success: false,
        timestamp: new Date().toISOString(),
        topicId,
        userMessageId: userMessageId ?? parentMessageId ?? '',
      };
    }
  } else {
    // Local CLI hetero (Amp / Claude Code / Codex / Kimi Code / OpenCode /
    // Pi / Qoder) — fork between device dispatch and cloud sandbox via the
    // shared execution plan:
    //   - requestedDeviceId (topic-level override) always wins
    //   - executionTarget 'device' → dispatch to boundDeviceId (errors if unset)
    //   - executionTarget 'local' + boundDeviceId (desktop sync opened on web)
    //     → dispatch to that device
    //   - explicit 'sandbox' → cloud sandbox
    //   - 'none' / unset / unbound 'local' → pending: fails loudly below with an
    //     actionable "pick a device / cloud sandbox" error — never an implicit
    //     cloud fallback and never whichever client happened to send the run
    // `onlineDeviceIds` is intentionally omitted: hetero dispatch trusts
    // the binding and fails loudly at the gateway if the device is offline.
    // `canUseDevice` degrades device-capable targets to the sandbox when
    // available, or leaves device-only providers unrouted, for denied
    // senders (e.g. external bot users). Without this a synced local/device
    // binding would let them run on the owner's machine.

    // Register the op with the agent-gateway DO before dispatch, mirroring
    // the remote-hetero branch above. Local CLI hetero (claude-code / codex)
    // streams back via heteroIngest, which forwards live events the DO can
    // relay even without an init — so the FIRST run renders fine. But a later
    // `reconnectToGatewayOperation` (task topic drawer open / page reload)
    // sends a `resume` that asks the DO for the op's status; with no session
    // record the DO answers terminal, the client fires `session_complete`,
    // and `onSessionComplete` clears `topic.metadata.runningOperation`. The
    // still-running CC's next heteroIngest batch then hits
    // StaleHeteroOperationError and is silently dropped — the agent appears
    // to stop the moment the window is opened. Seeding the init keeps the DO
    // reporting `running`, so resume stays connected and keeps streaming.
    // Best-effort: a stream-manager/Redis failure must never block dispatch —
    // the init only powers reconnect, not the run. `createStreamEventManager`
    // probes Redis synchronously, so guard construction too, not just publish.
    try {
      await persistOperationMetadata();
      await createStreamEventManager().publishAgentRuntimeInit(operationId, {
        agentId: resolvedAgentId,
        assistantMessageId,
        heteroType,
        mirrorToOperationId: topicStartOwnerOperationId,
        topicId,
        userId: deps.userId,
      });
    } catch (err) {
      log('execAgent: failed to init stream for local hetero: %O', err);
    }

    const heteroPlan = deviceHeteroPlan!;

    if (heteroPlan.kind !== 'sandbox') {
      const dispatchDeviceId = heteroPlan.kind === 'device' ? heteroPlan.deviceId : undefined;
      if (!dispatchDeviceId) {
        log('execAgent: hetero executionTarget=device but no boundDeviceId set');
        await finalizeHeteroDispatchError(deps, {
          agentId: resolvedAgentId,
          assistantMessageId,
          detail: !supportsCloudHeterogeneousSandbox(heteroType, heterogeneousProvider?.engine)
            ? 'No device bound. Pick a local or connected device in the Execution Device switcher.'
            : 'No device bound. Pick a device in the Execution Device switcher, or switch to Cloud sandbox.',
          message: 'No bound device for hetero agent',
          operationId,
          topicId,
        });
        return {
          agentId: resolvedAgentId,
          assistantMessageId,
          autoStarted: false,
          createdAt: new Date().toISOString(),
          error: 'No bound device',
          message: 'Hetero agent requires a bound device',
          operationId,
          status: 'error',
          success: false,
          timestamp: new Date().toISOString(),
          topicId,
          userMessageId: userMessageId ?? parentMessageId ?? '',
        };
      }
      // Resolve the working directory for the run: a topic-level override
      // wins, else the device's user-configured defaultCwd. The device row
      // lives in the DB (the gateway only knows live connections), so read
      // it directly rather than via deviceGateway.
      // The bound device may be personal (userId-scoped) or a workspace
      // device (workspace-scoped) — look up both so its defaultCwd resolves.
      const deviceModelForCwd = new DeviceModel(deps.db, deps.userId, deps.workspaceId);
      const boundDevice =
        (await deviceModelForCwd.findByDeviceId(dispatchDeviceId)) ??
        (await deviceModelForCwd.findWorkspaceDeviceById(dispatchDeviceId));
      const dispatchWorkspaceId = cliDeviceWorkspaceId;
      // Resolve via the shared precedence helper so dispatch, workspace-init,
      // and the new-topic backfill below all agree on the cwd.
      const deviceCwdConfig = resolveDeviceWorkingDirectoryConfig({
        deviceDefaultCwd: boundDevice?.defaultCwd,
        deviceId: dispatchDeviceId,
        initialWorkingDirectory: appContext?.initialTopicMetadata?.workingDirectory,
        initialWorkingDirectoryConfig: appContext?.initialTopicMetadata?.workingDirectoryConfig,
        topicWorkingDirectory: topic?.metadata?.workingDirectory,
        topicWorkingDirectoryConfig: topic?.metadata?.workingDirectoryConfig,
        workingDirByDevice: agentConfig.agencyConfig?.workingDirByDevice,
      });
      const deviceCwd = getWorkingDirEffectivePath(deviceCwdConfig);

      // An unbound topic has no pinned cwd yet: the directory was only
      // recorded at agent level (`workingDirByDevice`) when no topic existed.
      // Persist the resolved cwd onto the topic so the sidebar groups it
      // under the right project and the next turn reuses the same directory.
      await deps.bindTopicWorkingDirectory({
        config: deviceCwdConfig,
        currentWorkingDirectory: topic?.metadata?.workingDirectory,
        topicId,
      });

      // Persist the device-scoped tool context the `execBuiltinTool` callback
      // rebuilds `ToolExecutionContext` from: which device + cwd device-proxy
      // runtimes (localSystem/remoteDevice/browser) should target. Lives on the
      // op row — durable across Lambda instances, unlike the Redis metadata —
      // and is written only when this run actually mounts builtin tools.
      if (builtinToolSpecs?.length) {
        try {
          await deps.db
            .update(agentOperations)
            .set({
              metadata: sql`coalesce(${agentOperations.metadata}, '{}'::jsonb) || ${JSON.stringify({
                builtinToolContext: {
                  activeDeviceId: dispatchDeviceId,
                  activeDeviceScope: dispatchWorkspaceId ? 'workspace' : 'personal',
                  workingDirectory: deviceCwd,
                },
              })}::jsonb`,
            })
            .where(eq(agentOperations.id, operationId));
        } catch (err) {
          log('execAgent: failed to persist builtinToolContext: %O', err);
        }
      }

      // Build only device-relevant context instead of reusing the cloud-sandbox one
      // (which describes an ephemeral /workspace + pre-cloned repos and would mislead
      // the agent). The spawned CLI already receives deviceCwd as its actual cwd.
      const deviceSystemContext = buildRemoteDeviceHeteroContext({
        agentSystemContext,
        conversationHistory: resumeSessionId ? undefined : conversationHistory,
      });
      const deviceResumeFallbackSystemContext =
        resumeSessionId && conversationHistory
          ? buildRemoteDeviceHeteroContext({
              agentSystemContext,
              conversationHistory,
            })
          : undefined;

      const authorizationError = await resolveDeviceDispatchAuthorizationFailure(
        deps.db,
        deps.userId,
        dispatchDeviceId,
        dispatchWorkspaceId,
      );

      // Durable admission BEFORE the gateway call — see writeDispatchAdmission.
      await writeDispatchAdmission(deps, {
        channel: 'agent_run_request',
        deviceId: dispatchDeviceId,
        deviceUserId: deps.userId,
        deviceWorkspaceId: dispatchWorkspaceId,
        operationId,
      });

      const result = authorizationError
        ? {
            error: 'DEVICE_NOT_FOUND',
            errorCode: DeviceTransportErrorCode.DeviceNotFound,
            errorData: authorizationError,
            success: false,
          }
        : await deviceGateway.dispatchAgentRun({
            ...heteroParams,
            args: heteroExecArgs,
            cwd: deviceCwd,
            deviceId: dispatchDeviceId,
            // The device dedupes agent_run_request on this key (= the task id
            // it already tracks for cancelHeteroTask), so a gateway retry can
            // never spawn a duplicate execution of this operation.
            idempotencyKey: operationId,
            resumeFallbackSystemContext: deviceResumeFallbackSystemContext,
            runGeneration: 1,
            systemContext: deviceSystemContext,
            // Route to the workspace pool when this is a workspace device; the
            // operation JWT stays member-scoped (the run belongs to the member).
            workspaceId: dispatchWorkspaceId,
            // Topic scope for device-side heteroIngest/heteroFinish. Distinct
            // from the routing workspace above: a workspace topic on a personal
            // device still has to write back under `deps.workspaceId`.
            ingestWorkspaceId: deps.workspaceId,
          });
      const dispatchOutcome = await settleRemoteDispatchOutcome(deps, {
        error: result.error,
        errorCode: result.errorCode,
        operationId,
        success: result.success,
        topicId,
      });
      if (dispatchOutcome.outcome === 'unknown') {
        // Ambiguous ack — keep the run open and report an in-progress result;
        // see the remote-hetero branch above.
        log(
          'execAgent: hetero device dispatch outcome unknown (device may be running) op=%s error=%s',
          operationId,
          result.error,
        );
        return {
          agentId: resolvedAgentId,
          assistantMessageId,
          autoStarted: true,
          createdAt: new Date().toISOString(),
          errorData: result.errorData,
          heteroType,
          message:
            'Dispatch acknowledgement was lost; the run may still be executing on the device. Do not retry the same operation.',
          operationId,
          remoteAdmission: 'unknown',
          status: 'unknown',
          success: true,
          timestamp: new Date().toISOString(),
          token: deps.withholdGatewayToken
            ? undefined
            : await signUserJWT(deps.userId).catch(() => undefined),
          topicId,
          userMessageId: userMessageId ?? parentMessageId ?? '',
        };
      }
      if (dispatchOutcome.outcome === 'terminal') {
        log('execAgent: hetero device dispatch failed: %s', result.error);
        await finalizeHeteroDispatchError(deps, {
          agentId: resolvedAgentId,
          assistantMessageId,
          detail: result.error ?? 'Device dispatch failed',
          errorData: result.errorData,
          errorType: resolveHeteroDispatchErrorType(result.error),
          message: humanizeHeteroDispatchError(result.error),
          operationId,
          topicId,
        });
        return {
          agentId: resolvedAgentId,
          assistantMessageId,
          autoStarted: false,
          createdAt: new Date().toISOString(),
          error: result.error,
          errorData: result.errorData,
          message: 'Hetero agent device dispatch failed',
          operationId,
          remoteAdmission: dispatchOutcome.admissionState,
          status: 'error',
          success: false,
          timestamp: new Date().toISOString(),
          topicId,
          userMessageId: userMessageId ?? parentMessageId ?? '',
        };
      }

      // Local CLI hetero agents dispatch to a device just like remote platform
      // agents, so persist the device route after the dispatch is accepted.
      // interruptTask uses these fields to find and stop the native process.
      try {
        const patched = await deps.topicModel.patchRunningOperation(topicId, operationId, {
          deviceId: dispatchDeviceId,
          deviceWorkspaceId: dispatchWorkspaceId,
          heteroType,
        });
        log(
          'execAgent: patch runningOperation device info=%s deviceId=%s heteroType=%s op=%s',
          patched,
          dispatchDeviceId,
          heteroType,
          operationId,
        );
      } catch (err) {
        log('execAgent: failed to patch runningOperation with device info: %O', err);
      }
    } else {
      if (!supportsCloudHeterogeneousSandbox(heteroType, heterogeneousProvider?.engine)) {
        const message = `${getHeterogeneousAgentTitle(heteroType)} requires a local or connected device; cloud sandbox execution is not supported.`;
        await finalizeHeteroDispatchError(deps, {
          agentId: resolvedAgentId,
          assistantMessageId,
          detail: message,
          message,
          operationId,
          topicId,
        });
        return {
          agentId: resolvedAgentId,
          assistantMessageId,
          autoStarted: false,
          createdAt: new Date().toISOString(),
          error: message,
          message,
          operationId,
          status: 'error',
          success: false,
          timestamp: new Date().toISOString(),
          topicId,
          userMessageId: userMessageId ?? parentMessageId ?? '',
        };
      }

      // Cloud sandbox path — only for sandbox-provisioned local CLI agents.
      // Remote agents (openclaw / hermes) always require a bound device.
      // Lazy-loaded on purpose: `sandboxRunner` pulls the sandbox-service graph
      // (which eagerly touches server-only ModelRuntime env at module init), so
      // importing it statically would couple that whole subsystem into every
      // `aiAgent` import. Only this cloud-CLI branch needs it.
      const { spawnHeteroSandbox } =
        await import('@/server/services/heterogeneousAgent/sandboxRunner');
      const marketService = await deps.getMarketService();
      // The sandbox authenticates its nested `lh` calls with this JWT. The
      // narrow `hetero-operation` token (used for the device-dispatch path
      // above) is rejected by `oidcAuth`, so CC capabilities that hit
      // user-scoped endpoints — e.g. uploading a `Read`-on-image result to
      // the file store for thumbnail echo — would 401 and silently drop.
      // Mint a user-scoped `cli-sandbox` token instead (still `sub: userId`,
      // ownership-gated on heteroIngest/heteroFinish) with a run-length TTL
      // so it outlives a multi-hour run.
      const sandboxJwt = await signUserJWT(deps.userId, '4h');
      // Durable admission BEFORE the spawn — the sandbox is the execution host
      // for this channel; `deviceId` stays absent by design.
      await writeDispatchAdmission(deps, { channel: 'cloud_sandbox', operationId });

      // Same builtinToolContext contract as the device branch — sandbox runs
      // have no bound device but do have a working directory (`/workspace`).
      if (builtinToolSpecs?.length) {
        try {
          await deps.db
            .update(agentOperations)
            .set({
              metadata: sql`coalesce(${agentOperations.metadata}, '{}'::jsonb) || ${JSON.stringify({
                builtinToolContext: { workingDirectory: '/workspace' },
              })}::jsonb`,
            })
            .where(eq(agentOperations.id, operationId));
        } catch (err) {
          log('execAgent: failed to persist builtinToolContext: %O', err);
        }
      }

      spawnHeteroSandbox({
        ...heteroParams,
        agentType: heteroCliAgentType as 'claude-code' | 'codex',
        args: heteroExecArgs,
        jwt: sandboxJwt,
        marketService,
        // `heteroParams.jwt` (the operation token) is overridden above for
        // user-scoped sandbox calls; re-forward it under its own key so the
        // CLI's builtin-tool callbacks keep `hetero:tool:exec`.
        operationJwt,
        workspaceId: deps.workspaceId,
      }).catch(async (err) => {
        // Fire-and-forget: execAgent has already returned `autoStarted`, and
        // the sandbox never reached the point of calling heteroFinish. Drive
        // the same terminal funnel so the stranded run surfaces an error and
        // its task is marked failed instead of hanging in `running`.
        log('execAgent: hetero sandbox spawn failed: %O', err);

        // ...unless the run is demonstrably alive or already finished. This
        // call is the only dispatch failure that can land AFTER the agent
        // started, so a rejection here is not by itself evidence that nothing
        // ran — see `hasHeteroRunStarted`.
        if (await hasHeteroRunStarted(deps, { operationId, topicId })) {
          await markRemoteRunRunning(deps.db, operationId).catch(() => undefined);
          return;
        }

        // The spawn ack is ambiguous (a gateway 504 can arrive after the
        // sandbox booted): record `unknown` so the ledger stays honest even
        // though the run is finalized as failed below.
        await writeRemoteRunAdmission(deps.db, operationId, {
          reason: err instanceof Error ? err.message : String(err),
          state: 'unknown',
        }).catch(() => undefined);

        await finalizeHeteroDispatchError(deps, {
          agentId: resolvedAgentId,
          assistantMessageId,
          detail: err instanceof Error ? err.message : String(err),
          message: 'Hetero sandbox spawn failed',
          operationId,
          topicId,
        }).catch((finalizeErr) =>
          log('execAgent: sandbox-failure finalize failed: %O', finalizeErr),
        );
      });
    }
  }

  let gatewayToken: string | undefined;
  if (!deps.withholdGatewayToken) {
    try {
      gatewayToken = await signUserJWT(deps.userId);
    } catch {
      // non-critical
    }
  }

  return {
    agentId: resolvedAgentId,
    assistantMessageId,
    autoStarted: true,
    createdAt: new Date().toISOString(),
    heteroType,
    message: 'Hetero agent dispatched successfully',
    operationId,
    status: 'created',
    success: true,
    timestamp: new Date().toISOString(),
    token: gatewayToken,
    topicId,
    userMessageId: userMessageId ?? parentMessageId ?? '',
  };
};

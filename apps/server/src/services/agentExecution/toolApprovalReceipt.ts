import { isPlainRecord } from '@orvilo/utils/object';

import { EventOutboxModel, newEventId } from '@/database/models/eventOutbox';
import type { OrviloDatabase } from '@/database/type';

import { sha256Hex, stableStringify } from '../aiAgent/pipeline/externalToolPins';

/**
 * One-time approval receipts for `needs_approval` external tools on the ACP
 * builtin-tool callback path (SA02/F04).
 *
 * A receipt is an `event_outbox` row keyed by a deterministic `eventId` —
 * `aggregateType: 'agent_operation'` keeps it inside the operation's event
 * stream and dedupes on the unique `eventId`. The row's `nextAttemptAt` is set
 * to the receipt deadline so the room sweep (`fetchPending`/`claimPending`
 * only pick rows whose `nextAttemptAt` is NULL or already past) cannot mark a
 * live approval `delivered` — consumed semantics live in `payload.consumedAt`
 * and `payload.deliveryState`, never in the row status.
 */

export const TOOL_APPROVAL_EVENT_TYPE = 'agent_operation.tool_approval';

/** Default window the human has to decide before the receipt expires. */
export const TOOL_APPROVAL_TTL_MS = 10 * 60 * 1000;

export type ToolApprovalAction = 'approved' | 'denied';

export interface ToolApprovalDecision {
  action: ToolApprovalAction;
  decidedAt: number;
  decidedByUserId: string;
  /** Intervention resolution request id — dedupes client retries. */
  resolutionRequestId?: string;
  /**
   * Window the decision landed in — stamped server-side at write time so a
   * decision can never drift across a renew (window rotation clears it).
   */
  windowId?: string;
}

/**
 * The canonical approval scope — everything an approval binds besides the
 * window: principal, workspace, operation + generation, the exact tool call,
 * the pinned connection/install + grant epoch, the schema digest and the args
 * hash. `toolApprovalScopeHash` compresses it into the value the consume CAS
 * matches verbatim, so a receipt that doesn't match on ALL of these never
 * authorizes (two approval-gated tools may legitimately share a toolCallId +
 * argsHash — the scope hash is what keeps their receipts non-fungible).
 */
export interface ToolApprovalScope {
  agentId?: string;
  apiName: string;
  argsHash: string;
  authRevision?: string;
  connectorId?: string;
  executionGeneration?: number;
  identifier: string;
  kind: 'connector_tool' | 'plugin_tool';
  operationId: string;
  pluginInstallId?: string;
  schemaDigest?: string;
  toolCallId: string;
  userId: string;
  workspaceId: string;
}

/**
 * Canonical digest of the approval scope — stable across retries and key
 * order, so the same logical call always presents the same scope proof.
 */
export const toolApprovalScopeHash = (scope: ToolApprovalScope): string =>
  sha256Hex(
    stableStringify({
      agentId: scope.agentId ?? null,
      apiName: scope.apiName,
      argsHash: scope.argsHash,
      authRevision: scope.authRevision ?? null,
      connectorId: scope.connectorId ?? null,
      executionGeneration: scope.executionGeneration ?? null,
      identifier: scope.identifier,
      kind: scope.kind,
      operationId: scope.operationId,
      pluginInstallId: scope.pluginInstallId ?? null,
      schemaDigest: scope.schemaDigest ?? null,
      toolCallId: scope.toolCallId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
  );

/**
 * Everything an approval binds: the {@link ToolApprovalScope} digest plus the
 * window identity it was granted in (`windowId`/`windowVersion`). A receipt
 * that doesn't match on the full hash + the current decision window at
 * consume time never authorizes.
 */
export interface ToolApprovalReceiptPayload {
  agentId?: string;
  apiName: string;
  argsHash: string;
  authRevision?: string;
  connectorId?: string;
  consumedAt?: number;
  /** Which stable invocation spent the one-time grant (audit/dedupe). */
  consumedInvocationId?: string;
  decision?: ToolApprovalDecision;
  executionGeneration?: number;
  expiresAt: number;
  identifier: string;
  kind: 'connector_tool' | 'plugin_tool';
  operationId: string;
  pluginInstallId?: string;
  requestedAt: number;
  schemaDigest?: string;
  /** `toolApprovalScopeHash` of the exact scope this receipt authorizes. */
  scopeHash?: string;
  toolCallId: string;
  userId: string;
  /** Rotates on every renew — decision submits CAS-match it. */
  windowId?: string;
  /** Monotonic renewal counter; `1` on creation, +1 per window rotation. */
  windowVersion?: number;
  workspaceId: string;
}

export const toolApprovalEventId = (operationId: string, toolCallId: string): string =>
  `tool-approval:${operationId}:${toolCallId}`;

export const buildToolApprovalEvent = (
  params: ToolApprovalScope & {
    expiresAt: number;
    now: number;
    windowId: string;
  },
) => ({
  aggregateId: params.operationId,
  aggregateType: 'agent_operation',
  eventId: toolApprovalEventId(params.operationId, params.toolCallId),
  eventType: TOOL_APPROVAL_EVENT_TYPE,
  id: newEventId(),
  nextAttemptAt: new Date(params.expiresAt),
  payload: {
    agentId: params.agentId,
    apiName: params.apiName,
    argsHash: params.argsHash,
    authRevision: params.authRevision,
    connectorId: params.connectorId,
    expiresAt: params.expiresAt,
    executionGeneration: params.executionGeneration,
    identifier: params.identifier,
    kind: params.kind,
    operationId: params.operationId,
    pluginInstallId: params.pluginInstallId,
    requestedAt: params.now,
    schemaDigest: params.schemaDigest,
    scopeHash: toolApprovalScopeHash(params),
    toolCallId: params.toolCallId,
    userId: params.userId,
    windowId: params.windowId,
    windowVersion: 1,
    workspaceId: params.workspaceId,
  } satisfies ToolApprovalReceiptPayload,
  workspaceId: params.workspaceId,
});

const APPROVAL_POSITIVE_VALUES = new Set(['accept', 'allow', 'approve', 'approved', 'yes']);

/**
 * Fail-closed decode of the intervention result submitted for a
 * permission-kind approval card. The permission card submits the selected
 * option id (or label); anything unrecognizable — including malformed,
 * missing, or merely neutral payloads — decodes to `denied`, so an approval
 * can never be inferred from garbage input.
 */
export const decodeToolApprovalAction = (input: {
  cancelled?: boolean;
  result?: unknown;
}): ToolApprovalAction => {
  if (input.cancelled) return 'denied';
  const result = input.result;
  if (result === true) return 'approved';
  if (typeof result === 'string') {
    return APPROVAL_POSITIVE_VALUES.has(result.trim().toLowerCase()) ? 'approved' : 'denied';
  }
  if (!isPlainRecord(result)) return 'denied';

  for (const key of ['approved', 'action', 'decision', 'optionId', 'selectedOptionId']) {
    const value = result[key];
    if (value === true) return 'approved';
    if (typeof value === 'string' && APPROVAL_POSITIVE_VALUES.has(value.trim().toLowerCase())) {
      return 'approved';
    }
  }
  // Permission-card payloads are `{[questionText]: selectedOptionId}` — accept
  // any positive option value anywhere in the record.
  for (const value of Object.values(result)) {
    if (typeof value === 'string' && APPROVAL_POSITIVE_VALUES.has(value.trim().toLowerCase())) {
      return 'approved';
    }
  }
  return 'denied';
};

export type ToolApprovalReceiptStatus =
  | 'approved'
  | 'args_mismatch'
  | 'consumed'
  | 'denied'
  | 'expired'
  | 'pending'
  | 'missing'
  | 'scope_mismatch';

/**
 * The authorization verdict. `status: 'approved'` means THIS call won the
 * consume CAS and may execute — an `approved` classification from a pure
 * read-back is a *decision* state, not an execution grant, and only ever
 * re-arms the CAS (SA02-B). The window fields carry the live receipt's
 * coordinates so the caller can echo them into card state.
 */
export interface ToolApprovalAuthorization {
  expiresAt?: number;
  status: ToolApprovalReceiptStatus;
  windowId?: string;
  windowVersion?: number;
}

/**
 * Classify the receipt payload as the consume path would see it — the read-back
 * that turns a failed consume CAS into a precise refusal reason.
 */
export const classifyToolApprovalReceipt = (
  payload: Record<string, unknown> | undefined,
  now: number,
): ToolApprovalReceiptStatus => {
  if (!payload) return 'missing';
  if (typeof payload.consumedAt === 'number') return 'consumed';
  const expiresAt = typeof payload.expiresAt === 'number' ? payload.expiresAt : 0;
  const decision = isPlainRecord(payload.decision) ? payload.decision : undefined;
  if (decision?.action === 'denied') return 'denied';
  if (decision?.action === 'approved') {
    return expiresAt > now ? 'approved' : 'expired';
  }
  return expiresAt > now ? 'pending' : 'expired';
};

const receiptWindow = (payload: Record<string, unknown>): ToolApprovalAuthorization => ({
  expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : undefined,
  status: 'pending',
  windowId: typeof payload.windowId === 'string' ? payload.windowId : undefined,
  windowVersion: typeof payload.windowVersion === 'number' ? payload.windowVersion : undefined,
});

/**
 * The unified authorization step for approval-gated external calls:
 *
 * 1. read the receipt for (operationId, toolCallId);
 * 2. `pending` → return 'pending' (the host surfaces the approval card);
 * 3. `approved` + unexpired + full scope match → consume CAS → 'approved';
 * 4. expired + undecided/unconsumed → renew the window → 'pending';
 * 5. denied / consumed / scope or args mismatch → refuse.
 *
 * Only the caller that WINS the consume CAS is authorized — when the read-back
 * observes a fresh `approved` decision the loop re-runs the whole CAS instead
 * of trusting the observation, and a still-unwon approval after the bound
 * retries classifies as `consumed` (another invocation owns the grant).
 *
 * Every refusal path guarantees zero downstream side effects — callers return
 * before `ToolExecutionService.executeTool`/`mcpService.callTool` run.
 */
const AUTHORIZE_CAS_ATTEMPTS = 3;

export const authorizeToolApprovalReceipt = async (
  db: OrviloDatabase,
  params: {
    argsHash: string;
    /** Stable invocation id reserved atomically with the consume CAS. */
    invocationId: string;
    now: number;
    operationId: string;
    scopeHash: string;
    toolCallId: string;
  },
): Promise<ToolApprovalAuthorization> => {
  const model = new EventOutboxModel(db);
  const eventId = toolApprovalEventId(params.operationId, params.toolCallId);

  for (let attempt = 0; attempt < AUTHORIZE_CAS_ATTEMPTS; attempt += 1) {
    const consumed = await model.consumeToolApprovalReceipt({
      argsHash: params.argsHash,
      eventId,
      invocationId: params.invocationId,
      now: params.now,
      scopeHash: params.scopeHash,
    });
    if (consumed) return { status: 'approved' };

    const payload = await model.getDeliveryReceiptPayload(eventId);
    const status = classifyToolApprovalReceipt(payload, params.now);
    if (!payload) return { status };

    // Terminal receipts report their own state regardless of caller scope.
    if (status === 'consumed' || status === 'denied') {
      return { ...receiptWindow(payload), status };
    }
    // A live receipt only authorizes the exact scope it was granted for. An
    // EXPIRED one skips the scope check: the renew CAS rebinds the window to
    // the calling scope, so an args/schema edit can still re-pend a card.
    if (status !== 'expired') {
      if (payload.argsHash !== params.argsHash) return { status: 'args_mismatch' };
      if (payload.scopeHash !== params.scopeHash) return { status: 'scope_mismatch' };
    }
    // `approved` between the failed CAS and this read means a decision just
    // landed — loop back to a full CAS; the winner is the only executor.
    if (status === 'approved') continue;
    return { ...receiptWindow(payload), status };
  }

  // The receipt kept classifying as approved but this invocation never won the
  // CAS — treat it as spent (someone else's invocation owns the grant).
  return { status: 'consumed' };
};

/**
 * The outcome of a decision submit — the "save → confirm the winner" half of
 * every approval entry point (SC-SB03). `kind` is the discriminant the caller
 * switches on; `action`/`resolutionRequestId` are the WINNER's values (the
 * submitted decision on `decided`, the stored one on `already_decided`), so a
 * publish following an `already_decided` always projects the durable truth,
 * never the loser's possibly-opposite input.
 */
export interface ToolApprovalSubmitOutcome {
  /**
   * Canonical receipt action — the decoded submit on `decided`, the stored
   * winner's on `already_decided`. Absent for `not_tool_approval` /
   * `stale_window` / `closed`.
   */
  action?: ToolApprovalAction;
  kind:
    | 'already_decided'
    | 'closed'
    | 'decided'
    | 'not_tool_approval'
    | 'scope_mismatch'
    | 'stale_window';
  /** The stored winner's resolution request id, when present. */
  resolutionRequestId?: string;
  /** Live window coordinates on `stale_window` (the retryable conflict). */
  windowId?: string;
  windowVersion?: number;
}

/**
 * The ONE decision-commit step shared by every approval entry — Web/Desktop
 * `submitHeteroIntervention`, the Mobile token-only `resolveHeteroIntervention`,
 * and business resolutions all route through here so a decision can never be
 * partially applied: it either durably lands via the first-winner CAS, lands as
 * `already_decided` with the stored winner projected back, or reports a
 * refusal (`stale_window` = a retriable conflict against the LIVE window;
 * `closed` = consumed/swept-terminal; `not_tool_approval` = no receipt — an
 * ordinary askUser whose caller proceeds untouched).
 *
 * A write failure THROWS — a decision that cannot durably commit must never
 * be followed by a success notification.
 */
export const submitToolApprovalDecision = async (
  db: OrviloDatabase,
  params: {
    cancelled?: boolean;
    decidedByUserId: string;
    /**
     * The receipt scope digest the caller pinned (SC03) — a claim-minted or
     * post-claim read of the live row's scopeHash. When set, the decision
     * CAS refuses a re-scoped receipt as `scope_mismatch`.
     */
    expectedScopeHash?: string;
    /**
     * The window the card showed — or the exact window a business claim was
     * minted under / read after claiming (SC03). `undefined` only decides
     * legacy windowless receipts; `null` binds whichever window is live and
     * is the wildcard the token path must no longer pass.
     */
    expectedWindowId?: string | null;
    operationId: string;
    resolutionRequestId?: string;
    result?: unknown;
    toolCallId: string;
  },
): Promise<ToolApprovalSubmitOutcome> => {
  const action = decodeToolApprovalAction({ cancelled: params.cancelled, result: params.result });
  const outcome = await new EventOutboxModel(db).recordToolApprovalDecision({
    decision: {
      action,
      decidedAt: Date.now(),
      decidedByUserId: params.decidedByUserId,
      resolutionRequestId: params.resolutionRequestId,
    },
    eventId: toolApprovalEventId(params.operationId, params.toolCallId),
    expectedScopeHash: params.expectedScopeHash,
    expectedWindowId: params.expectedWindowId,
  });
  if (outcome.status === 'already_decided') {
    const winner = isPlainRecord(outcome.decision) ? outcome.decision : {};
    return {
      // Fail-closed on an unreadable winner action: the receipt exists and
      // decided, so 'denied' is the only safe projection of an unknown one.
      action: winner.action === 'approved' ? 'approved' : 'denied',
      kind: 'already_decided',
      resolutionRequestId:
        typeof winner.resolutionRequestId === 'string' ? winner.resolutionRequestId : undefined,
      windowId: outcome.windowId,
      windowVersion: outcome.windowVersion,
    };
  }
  if (outcome.status === 'decided') {
    return { action, kind: 'decided' };
  }
  return {
    kind: outcome.status,
    windowId: outcome.windowId,
    windowVersion: outcome.windowVersion,
  };
};

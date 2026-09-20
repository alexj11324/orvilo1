import { isPlainRecord } from '@orvilo/utils/object';

import { EventOutboxModel, newEventId } from '@/database/models/eventOutbox';
import type { OrviloDatabase } from '@/database/type';

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
}

/**
 * Everything an approval binds: principal, workspace, operation +
 * generation, the exact tool call, the pinned connection/grant, the schema
 * digest and the args hash. A receipt that doesn't match on ALL of these at
 * consume time never authorizes.
 */
export interface ToolApprovalReceiptPayload {
  agentId?: string;
  apiName: string;
  argsHash: string;
  authRevision?: string;
  connectorId?: string;
  consumedAt?: number;
  decision?: ToolApprovalDecision;
  executionGeneration?: number;
  expiresAt: number;
  identifier: string;
  kind: 'connector_tool' | 'plugin_tool';
  operationId: string;
  pluginInstallId?: string;
  requestedAt: number;
  schemaDigest?: string;
  toolCallId: string;
  userId: string;
  workspaceId: string;
}

export const toolApprovalEventId = (operationId: string, toolCallId: string): string =>
  `tool-approval:${operationId}:${toolCallId}`;

export const buildToolApprovalEvent = (params: {
  agentId?: string;
  apiName: string;
  argsHash: string;
  authRevision?: string;
  connectorId?: string;
  expiresAt: number;
  executionGeneration?: number;
  identifier: string;
  kind: 'connector_tool' | 'plugin_tool';
  now: number;
  operationId: string;
  pluginInstallId?: string;
  schemaDigest?: string;
  toolCallId: string;
  userId: string;
  workspaceId: string;
}) => ({
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
    toolCallId: params.toolCallId,
    userId: params.userId,
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
  'approved' | 'args_mismatch' | 'consumed' | 'denied' | 'expired' | 'pending' | 'missing';

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

/**
 * The unified authorization step for approval-gated external calls:
 *
 * 1. read the receipt for (operationId, toolCallId);
 * 2. `pending` → return 'pending' (the host surfaces the approval card);
 * 3. `approved` + unexpired + argsHash match → consume CAS → 'approved';
 * 4. expired + undecided/unconsumed → renew the window → 'pending';
 * 5. denied / consumed / argsHash-mismatch → refuse.
 *
 * Every refusal path guarantees zero downstream side effects — callers return
 * before `ToolExecutionService.executeTool`/`mcpService.callTool` run.
 */
export const authorizeToolApprovalReceipt = async (
  db: OrviloDatabase,
  params: {
    argsHash: string;
    now: number;
    operationId: string;
    toolCallId: string;
  },
): Promise<ToolApprovalReceiptStatus> => {
  const model = new EventOutboxModel(db);
  const eventId = toolApprovalEventId(params.operationId, params.toolCallId);

  const consumed = await model.consumeToolApprovalReceipt({
    argsHash: params.argsHash,
    eventId,
    now: params.now,
  });
  if (consumed) return 'approved';

  const payload = await model.getDeliveryReceiptPayload(eventId);
  const status = classifyToolApprovalReceipt(payload, params.now);
  // An approval covers the exact arguments it was granted for — a changed
  // call under the same receipt refuses as a mismatch, not a replay.
  if (status === 'approved' && payload?.argsHash !== params.argsHash) return 'args_mismatch';
  return status;
};

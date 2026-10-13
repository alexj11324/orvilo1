import { createHash, randomBytes } from 'node:crypto';

import type { AcpBuiltinToolSpec } from '@orvilo/types';

import { jsonSchemaToZodRawShape } from './jsonSchemaToZod';
import type { McpExtraTool, McpExtraToolCallExtra, McpToolResult } from './OrviloBuiltinMcpServer';

/**
 * Server-backed builtin tools mounted on the per-run `orvilo_cc` MCP server
 * (P70c). Each `AcpBuiltinToolSpec` api becomes an MCP tool whose handler
 * calls the server's `heteroExecBuiltinTool` endpoint; deferred orchestration
 * results (sub-agents / group members) are awaited through
 * `heteroAwaitBuiltinToolChildren` until every child operation settles.
 *
 * The caller is supplied by the producer (CLI / desktop) so this package
 * stays transport-agnostic.
 */
export interface AcpBuiltinToolCaller {
  /**
   * v2 ledger consume: acknowledges `deliveryEventIds` from a settled
   * `awaitChildren` response via `heteroAckChildResultDeliveries` — the only
   * transition that marks a child result consumed. Optional so older hosts
   * (v1 contract) need no change; its presence is ALSO the capability bit the
   * host uses to negotiate `contractVersion: 2`.
   */
  ackChildResults?: (input: {
    deliveryEventIds: string[];
    operationId: string;
  }) => Promise<{ acked?: string[]; ignored?: string[] }>;
  awaitChildren: (input: {
    childOperationIds: string[];
    /**
     * Ledger contract this host implements. `2` means the settle response
     * carries `deliveries` which are acked via `ackChildResults`. Omit for
     * the v1 consume-on-settle semantics.
     */
    contractVersion?: number;
    operationId: string;
    timeoutMs?: number;
    toolCallId: string;
    /**
     * Server-side cumulative bound for this wait — the remaining budget.
     * The server stamps an absolute `awaitDeadlineAt` once (first accept),
     * so a restarted host resumes against the same fixed instant.
     */
    waitDeadlineMs?: number;
  }) => Promise<
    | {
        contractVersion?: number;
        deliveries?: Array<{
          childOperationId: string;
          deliveryState: 'acked' | 'offered' | 'received' | 'superseded';
          eventId: string;
        }>;
        results: Array<{ content?: string; error?: string; operationId: string; status: string }>;
        status: 'settled';
      }
    | { contractVersion?: number; pendingOperationIds: string[]; status: 'pending' | 'timeout' }
  >;
  exec: (input: {
    apiName: string;
    args: Record<string, unknown>;
    identifier: string;
    operationId: string;
    toolCallId: string;
  }) => Promise<{
    childOperationIds?: string[];
    content?: string;
    deferred?: boolean;
    error?: { code?: string; message: string };
    state?: Record<string, unknown>;
    success: boolean;
  }>;
  /**
   * Durable receiver-side inbox write (SA04-A): invoked with the settled
   * deliveries BEFORE the idempotent ack is sent. The host persists the
   * result content/references keyed by the stable invocation so a crash
   * between "results received" and "ack sent" leaves the records replayable —
   * the next settle re-delivers them and the retried call reuses the same
   * invocation id. Optional: hosts without durable storage still consume v2
   * correctly but lose crash-recovery of unacked results.
   */
  persistChildResultInbox?: (input: {
    deliveries: Array<{ childOperationId: string; eventId: string }>;
    operationId: string;
    results: Array<{ content?: string; error?: string; operationId: string; status: string }>;
    toolCallId: string;
  }) => Promise<void>;
  /**
   * Human-interaction surface for `needs_approval` external tools (F04): the
   * server returns `acp_tool_approval_pending`; the host asks the user
   * through the run's bridge (`AskUserBridge.pending`, permission kind). The
   * server-side receipt is the decision authority — this callback only
   * surfaces the card; the retry re-reads the receipt.
   */
  requestApproval?: (input: {
    apiName: string;
    args: Record<string, unknown>;
    expiresAt?: number;
    identifier: string;
    operationId: string;
    toolCallId: string;
    /** Approval-window id the card must echo back on submit (SA02-C). */
    windowId?: string;
  }) => Promise<{ cancelled?: boolean; cancelReason?: string; result?: unknown }>;
  /**
   * Durable invocation-identity resolver (SC-SB06): maps one protocol request
   * (`requestKey`, e.g. `_meta.progressToken`) to the stable toolCallId the
   * FIRST delivery used, so a transport resend reuses it while every genuinely
   * new occurrence — including same-args calls — mints a fresh id. `argsHash`
   * is only a content-consistency proof; it must never substitute for
   * occurrence identity. Hosts without this resolver get the deterministic
   * request-key digest / fresh-mint fallback in the handler.
   */
  resolveToolCallId?: (input: {
    apiName: string;
    argsHash: string;
    identifier: string;
    operationId: string;
    requestKey?: string;
  }) => Promise<string>;
}

const text = (value: string): McpToolResult => ({
  content: [{ text: value, type: 'text' }],
});

const errorText = (value: string): McpToolResult => ({
  content: [{ text: value, type: 'text' }],
  isError: true,
});

/** Canonical JSON with sorted keys — deterministic across key order. */
const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

/** MCP tool name — `[a-zA-Z0-9_-]` only, so `identifier__apiName`. */
const toolName = (identifier: string, apiName: string) =>
  `${identifier}__${apiName}`.replaceAll(/[^\w-]/g, '_');

const CHILD_POLL_INTERVAL_MS = 2_000;
const CHILD_POLL_TIMEOUT_MS = 25_000;
/** Upper bound for a deferred orchestration wait — matches the bridge cadence. */
const CHILD_WAIT_BUDGET_MS = 30 * 60_000;

export const buildAcpBuiltinToolExtras = (
  specs: AcpBuiltinToolSpec[],
  caller: AcpBuiltinToolCaller,
): McpExtraTool[] =>
  specs.flatMap((spec) =>
    spec.apis.map((api) => ({
      description: api.description ?? `Orvilo builtin tool ${spec.identifier}.${api.name}`,
      handler: async (operationId, args, extra?: McpExtraToolCallExtra) => {
        // Invocation identity (SC-SB06/P1-A): identical args do NOT make one
        // call — two legitimate same-args invocations must never share an id
        // (the first's consumed approval would replay for the second). Order:
        // the adapter's own toolUseId verbatim → the host's durable
        // request-key resolver → a deterministic per-request digest → a fresh
        // mint when no request identity reached this layer at all.
        const metaToolUseId = extra?._meta?.['claudecode/toolUseId'];
        const rawProgressToken = extra?._meta?.['progressToken'];
        const requestKey =
          typeof rawProgressToken === 'string' || typeof rawProgressToken === 'number'
            ? `pt:${String(rawProgressToken)}`
            : undefined;
        const argsHash = createHash('sha256')
          .update(
            stableStringify({
              apiName: api.name,
              args,
              identifier: spec.identifier,
              operationId,
            }),
          )
          .digest('hex');
        let toolCallId: string;
        if (typeof metaToolUseId === 'string' && metaToolUseId.length > 0) {
          toolCallId = metaToolUseId;
        } else if (caller.resolveToolCallId) {
          try {
            toolCallId = await caller.resolveToolCallId({
              apiName: api.name,
              argsHash,
              identifier: spec.identifier,
              operationId,
              requestKey,
            });
          } catch (error) {
            return errorText(String((error as Error)?.message ?? error));
          }
        } else if (requestKey !== undefined) {
          // No durable map on this host — the request key + content hash is
          // still a stable resend identity, and a key recycled for different
          // args resolves to a different id.
          toolCallId = `mcp_${createHash('sha256')
            .update(`${operationId}\0${requestKey}\0${argsHash}`)
            .digest('hex')
            .slice(0, 48)}`;
        } else {
          toolCallId = `mcp_${randomBytes(24).toString('hex')}`;
        }
        let result: Awaited<ReturnType<AcpBuiltinToolCaller['exec']>>;
        try {
          result = await caller.exec({
            apiName: api.name,
            args,
            identifier: spec.identifier,
            operationId,
            toolCallId,
          });
        } catch (error) {
          return errorText(String((error as Error)?.message ?? error));
        }

        // needs_approval gate (F04): the server parked the call behind a
        // one-time receipt. Surface the permission card through the run's
        // interaction bridge, then retry the SAME toolCallId — the retry
        // consumes the receipt if the user approved, or refuses again. Old
        // hosts without `requestApproval` see a plain tool error.
        if (
          !result.success &&
          result.error?.code === 'acp_tool_approval_pending' &&
          caller.requestApproval
        ) {
          const toolApproval =
            typeof result.state?.toolApproval === 'object' && result.state.toolApproval !== null
              ? (result.state.toolApproval as { expiresAt?: number; windowId?: string })
              : undefined;
          const answer = await caller.requestApproval({
            apiName: api.name,
            args,
            expiresAt: toolApproval?.expiresAt,
            identifier: spec.identifier,
            operationId,
            toolCallId,
            windowId: toolApproval?.windowId,
          });
          if (answer.cancelled) {
            return errorText(`Tool call was not approved (${answer.cancelReason ?? 'cancelled'})`);
          }
          try {
            result = await caller.exec({
              apiName: api.name,
              args,
              identifier: spec.identifier,
              operationId,
              toolCallId,
            });
          } catch (error) {
            return errorText(String((error as Error)?.message ?? error));
          }
        }

        if (!result.success) {
          return errorText(result.error?.message ?? 'Tool execution failed');
        }

        if (result.deferred) {
          const children = result.childOperationIds ?? [];
          if (children.length === 0) {
            return text(result.content ?? 'Delegated work accepted.');
          }
          const deadline = Date.now() + CHILD_WAIT_BUDGET_MS;
          for (;;) {
            let poll: Awaited<ReturnType<AcpBuiltinToolCaller['awaitChildren']>>;
            try {
              poll = await caller.awaitChildren({
                childOperationIds: children,
                // contractVersion is negotiated by capability (SA04-A + D03):
                // v2 is the RELIABLE-delivery contract — it requires BOTH the
                // durable inbox write AND the ack; a host missing either asks
                // for v1 consume-on-settle and never claims crash-proof acks.
                contractVersion: caller.ackChildResults && caller.persistChildResultInbox ? 2 : 1,
                operationId,
                timeoutMs: CHILD_POLL_TIMEOUT_MS,
                toolCallId,
                // Remaining budget as the server-side bound — the server
                // stamps an absolute deadline at first accept, so a restarted
                // host resumes against the same fixed instant.
                waitDeadlineMs: Math.max(1, deadline - Date.now()),
              });
            } catch (error) {
              return errorText(String((error as Error)?.message ?? error));
            }
            if (poll.status === 'settled') {
              // v2 only counts when the server echoes it — a v1-shaped settle
              // (`contractVersion !== 2`) already consumed at the server and
              // must not be treated as awaiting host ack.
              const settledVersion = poll.contractVersion === 2 ? 2 : 1;
              const pendingDeliveries = (poll.deliveries ?? []).filter(
                (delivery) =>
                  delivery.deliveryState !== 'acked' && delivery.deliveryState !== 'superseded',
              );
              if (settledVersion === 2 && pendingDeliveries.length > 0) {
                if (!caller.ackChildResults || !caller.persistChildResultInbox) {
                  return errorText(
                    'Child results settled under delivery contract v2 but this host cannot durably persist + acknowledge them — upgrade the host caller',
                  );
                }
                // Durable receiver inbox BEFORE ack (SA04-A): a crash between
                // receiving the results and acknowledging must not lose them.
                // The write failing is reported, not swallowed — the receipts
                // stay `offered` and the next settle re-delivers.
                try {
                  await caller.persistChildResultInbox({
                    deliveries: pendingDeliveries.map((delivery) => ({
                      childOperationId: delivery.childOperationId,
                      eventId: delivery.eventId,
                    })),
                    operationId,
                    results: poll.results,
                    toolCallId,
                  });
                } catch (error) {
                  return errorText(
                    `Could not durably record child results before acknowledging: ${String(
                      (error as Error)?.message ?? error,
                    )}`,
                  );
                }
                let ack: { acked?: string[]; ignored?: string[] } | undefined;
                try {
                  ack = await caller.ackChildResults({
                    deliveryEventIds: pendingDeliveries.map((delivery) => delivery.eventId),
                    operationId,
                  });
                } catch {
                  // The ack may have landed even though the response was
                  // lost — verify against the real receipt state below and
                  // retry rather than assuming.
                  ack = undefined;
                }
                const acked = new Set(ack?.acked ?? []);
                const unacked = pendingDeliveries
                  .map((delivery) => delivery.eventId)
                  .filter((eventId) => !acked.has(eventId));
                if (unacked.length > 0) {
                  // Unconfirmed consumes are never claimed — `ignored` or
                  // dropped acks re-loop so the next poll re-derives and
                  // re-acks them until the wait deadline.
                  if (Date.now() >= deadline) {
                    return errorText(
                      `Child results received but ${unacked.length} delivery receipt(s) could not be acknowledged before the wait deadline`,
                    );
                  }
                  await new Promise((resolve) => setTimeout(resolve, CHILD_POLL_INTERVAL_MS));
                  continue;
                }
              }
              const summary = poll.results
                .map((r) => r.content ?? r.error ?? `(${r.status})`)
                .filter(Boolean)
                .join('\n\n');
              const failed = poll.results.filter((r) => r.status !== 'done');
              if (failed.length > 0) {
                return errorText(
                  summary || `${failed.length} child operation(s) ended without output`,
                );
              }
              return text(summary || result.content || 'Done.');
            }
            if (poll.status === 'timeout' || Date.now() >= deadline) {
              return errorText(
                `Timed out waiting for child operations: ${poll.pendingOperationIds.join(', ')}`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, CHILD_POLL_INTERVAL_MS));
          }
        }

        return text(result.content ?? '');
      },
      inputSchema: jsonSchemaToZodRawShape(api.parameters),
      name: toolName(spec.identifier, api.name),
      title: `${spec.identifier}.${api.name}`,
    })),
  );

/**
 * Decode the `ORVILO_BUILTIN_TOOLS` env var the launcher seeds for each run
 * (base64 JSON `AcpBuiltinToolSpec[]`). Malformed input returns `[]` — a
 * garbage env must not kill the exec; the harness simply runs without the
 * builtin surface.
 */
export const decodeAcpBuiltinToolSpecs = (encoded: string | undefined): AcpBuiltinToolSpec[] => {
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (spec): spec is AcpBuiltinToolSpec =>
        spec && typeof spec.identifier === 'string' && Array.isArray(spec.apis),
    );
  } catch {
    return [];
  }
};

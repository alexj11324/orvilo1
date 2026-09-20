import { randomUUID } from 'node:crypto';

import type { AcpBuiltinToolSpec } from '@orvilo/types';

import { jsonSchemaToZodRawShape } from './jsonSchemaToZod';
import type { McpExtraTool, McpToolResult } from './OrviloBuiltinMcpServer';

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
   * (v1 contract) need no change.
   */
  ackChildResults?: (input: {
    deliveryEventIds: string[];
    operationId: string;
  }) => Promise<unknown>;
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
          deliveryState: 'acked' | 'offered' | 'superseded';
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
  }) => Promise<{ cancelled?: boolean; cancelReason?: string; result?: unknown }>;
}

const text = (value: string): McpToolResult => ({
  content: [{ text: value, type: 'text' }],
});

const errorText = (value: string): McpToolResult => ({
  content: [{ text: value, type: 'text' }],
  isError: true,
});

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
      handler: async (operationId, args) => {
        const toolCallId = `mcp_${randomUUID()}`;
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
          const expiresAt =
            typeof result.state?.toolApproval === 'object' && result.state?.toolApproval !== null
              ? (result.state.toolApproval as { expiresAt?: number }).expiresAt
              : undefined;
          const answer = await caller.requestApproval({
            apiName: api.name,
            args,
            expiresAt,
            identifier: spec.identifier,
            operationId,
            toolCallId,
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
                // v2: settle returns offered deliveries; ack below is the
                // durable consume. A host that cannot ack (old server) simply
                // falls back to v1 on the next field-negotiation round.
                contractVersion: 2,
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
              // Durable consume for v2 deliveries — the server stays
              // `offered` until this ack lands; a lost response replays the
              // settle on the next poll instead of losing the result.
              const eventIds = poll.deliveries?.map((d) => d.eventId) ?? [];
              if (eventIds.length > 0 && caller.ackChildResults) {
                try {
                  await caller.ackChildResults({ deliveryEventIds: eventIds, operationId });
                } catch {
                  // Ack failure only defers consumption — the receipt stays
                  // `offered` and a later poll re-offers it.
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

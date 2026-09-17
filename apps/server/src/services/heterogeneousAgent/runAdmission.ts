import type { LobeChatDatabase } from '@orvilo/database';
import { DeviceTransportErrorCode as TransportCode } from '@orvilo/device-gateway-client';
import type {
  AgentRunAdmissionRecord,
  AgentRunAdmissionState,
  AgentRunCancelRecord,
  AgentRunCancelState,
  RemoteExecutionStatus,
} from '@orvilo/types';
import debug from 'debug';
import { and, eq, sql } from 'drizzle-orm';

import { agentOperations } from '@/database/schemas';
import type { IStreamEventManager } from '@/server/modules/AgentExecution/types';

const log = debug('lobe-server:hetero-run-admission');

/**
 * Durable remote-run admission ledger (P20 — remote gateway & event decoupling).
 *
 * A remote/device-dispatched heterogeneous run crosses an unreliable hop —
 * server → device gateway → device WebSocket — where "the HTTP call failed" is
 * not the same fact as "the run never started". Before this ledger the only
 * record was the transient dispatch return value: a timeout got finalized as
 * an ordinary error while the device kept executing, and an interrupted run
 * had no way to distinguish "cancel sent" from "cancel confirmed".
 *
 * The ledger lives on `agent_operations.metadata` (jsonb — same pattern as
 * `agentInterventionDispatch` / `serverDefaultHeterogeneous`, so no schema
 * migration is needed):
 *
 * - `remoteAdmission` — written BEFORE the dispatch is attempted and driven
 *   through guarded transitions afterwards. Carries the operation's stable
 *   identity (idempotency key = operationId = the device-side task id), the
 *   resolved execution host (deviceId / device user / device workspace), the
 *   run-generation fence, and the native session id once reported.
 * - `remoteCancel` — the cancellation tri-state: `requested` when a cancel
 *   signal was dispatched, `confirmed` when the host provably stopped, and
 *   `unknown` when the outcome could not be confirmed (the run must be
 *   treated as potentially still writing — `OUTCOME_UNKNOWN`).
 *
 * Every write is a conditional jsonb merge: `jsonb_set` merges the patch into
 * the subkey, and the `WHERE` clause pins the states the transition may leave
 * from, so a retry or a late/stale callback can never regress the ledger
 * (e.g. a run already `running` cannot be demoted to `rejected` by a
 * duplicate dispatch-failure path).
 */

export const REMOTE_RUN_ADMISSION_KEY = 'remoteAdmission';
export const REMOTE_RUN_CANCEL_KEY = 'remoteCancel';

export type { RemoteRunChannel } from '@orvilo/types';

/**
 * The persisted admission record — the shared wire shape lives in
 * `@orvilo/types` (`AgentRunAdmissionRecord`) so status endpoints and
 * clients consume it verbatim.
 */
export type RemoteRunAdmission = AgentRunAdmissionRecord;

/** Persisted cancel record — shared wire shape (`AgentRunCancelRecord`). */
export type RemoteRunCancel = AgentRunCancelRecord;

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Map a normalized transport failure code onto the admission outcome it
 * proves. The split that matters is delivery certainty:
 *
 * - `offline`  — the gateway answered definitively that nothing reached the
 *   device (404 `DEVICE_NOT_FOUND`, 502/503 `DEVICE_CHANNEL_UNAVAILABLE`), or
 *   no gateway was configured at all. Nothing ran; the caller may finalize.
 * - `rejected` — the request was well-formed enough to be refused (4xx,
 *   auth, rate limit, explicit device `rejected` ack). Nothing ran.
 * - `unknown`  — the ack was lost: a response timeout (the device may still
 *   be running), an unreachable/reset gateway mid-request, or an
 * unclassified failure. Callers MUST NOT treat this as "never started".
 */
export const classifyRemoteDispatchFailure = (
  errorCode?: string,
): Extract<AgentRunAdmissionState, 'offline' | 'rejected' | 'unknown'> => {
  switch (errorCode) {
    case TransportCode.DeviceChannelUnavailable:
    case TransportCode.DeviceNotFound:
    case 'GATEWAY_NOT_CONFIGURED': {
      return 'offline';
    }
    case TransportCode.GatewayRejected:
    case TransportCode.RateLimited:
    case TransportCode.Unauthorized: {
      return 'rejected';
    }
    // DEVICE_RESPONSE_TIMEOUT / DEVICE_GATEWAY_ERROR /
    // DEVICE_GATEWAY_UNREACHABLE — and anything unrecognized — are ambiguous:
    // the request may have been delivered before the failure was observed.
    default: {
      return 'unknown';
    }
  }
};

/**
 * Which current ledger states a transition may leave from. A run already
 * `running` can never regress (a late dispatch-failure signal must not demote
 * it); terminal outcomes (`rejected` / `offline`) cannot be rewritten either.
 * `unknown` may resolve to `acknowledged` / `running` when the truth arrives.
 */
const ADMISSION_TRANSITION_SOURCES: Record<AgentRunAdmissionState, AgentRunAdmissionState[]> = {
  acknowledged: ['pending', 'unknown'],
  offline: ['pending'],
  pending: [],
  rejected: ['pending'],
  running: ['acknowledged', 'pending', 'unknown'],
  unknown: ['acknowledged', 'pending'],
};

/**
 * Apply a guarded admission transition to an existing record. Returns the
 * merged record, or `null` when the transition is not allowed from the
 * current state — the caller then leaves the durable row untouched.
 */
export const transitionRemoteAdmission = (
  current: RemoteRunAdmission,
  next: Partial<RemoteRunAdmission> & { state: AgentRunAdmissionState },
): RemoteRunAdmission | null => {
  if (!ADMISSION_TRANSITION_SOURCES[next.state]?.includes(current.state)) return null;
  return { ...current, ...next, updatedAt: new Date().toISOString() };
};

/**
 * Collapse an interrupt result onto the ACP cancel vocabulary. The run is
 * `confirmed` only when the execution host (device tool call → `exited`, or
 * the in-process runtime / durable terminal row) acknowledged the stop; every
 * other outcome — declined, transport failure, runtime absent — is `unknown`,
 * never "success".
 */
export const resolveRemoteCancelState = (result: {
  deviceCancellationConfirmed?: boolean;
  success: boolean;
}): AgentRunCancelState => {
  if (result.deviceCancellationConfirmed === true) return 'confirmed';
  if (result.deviceCancellationConfirmed === false) return 'unknown';
  return result.success ? 'confirmed' : 'unknown';
};

/** Defensive parse of `metadata.remoteAdmission` — tolerates absent/partial rows. */
export const readRemoteRunAdmission = (metadata: unknown): RemoteRunAdmission | undefined => {
  const record = (metadata as Record<string, unknown> | null | undefined)?.[
    REMOTE_RUN_ADMISSION_KEY
  ];
  if (!record || typeof record !== 'object') return undefined;
  const admission = record as RemoteRunAdmission;
  if (typeof admission.state !== 'string' || typeof admission.idempotencyKey !== 'string') {
    return undefined;
  }
  return admission;
};

/** Defensive parse of `metadata.remoteCancel`. */
export const readRemoteRunCancel = (metadata: unknown): RemoteRunCancel | undefined => {
  const record = (metadata as Record<string, unknown> | null | undefined)?.[REMOTE_RUN_CANCEL_KEY];
  if (!record || typeof record !== 'object') return undefined;
  const cancel = record as RemoteRunCancel;
  if (typeof cancel.state !== 'string' || typeof cancel.requestedAt !== 'string') {
    return undefined;
  }
  return cancel;
};

// ── Durable writers (conditional jsonb merges) ──────────────────────────────

const mergeSubkey = (key: string, patch: Record<string, unknown>) =>
  sql`jsonb_set(coalesce(${agentOperations.metadata}, '{}'::jsonb), ${`{${key}}`}::text[], coalesce(${agentOperations.metadata} -> ${key}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb, true)`;

/**
 * Persist the admission intent BEFORE the dispatch is attempted. Idempotent:
 * a duplicate create for the same operation is a no-op, so a retried
 * admission can never mint a second execution record (or bump the fence).
 */
export const createRemoteRunAdmission = async (
  db: LobeChatDatabase,
  operationId: string,
  admission: Omit<RemoteRunAdmission, 'state' | 'updatedAt'>,
): Promise<boolean> => {
  const updated = await db
    .update(agentOperations)
    .set({
      metadata: mergeSubkey(REMOTE_RUN_ADMISSION_KEY, {
        ...admission,
        state: 'pending',
        updatedAt: new Date().toISOString(),
      }),
    })
    .where(
      and(
        eq(agentOperations.id, operationId),
        sql`${agentOperations.metadata} -> ${REMOTE_RUN_ADMISSION_KEY} IS NULL`,
      ),
    )
    .returning({ id: agentOperations.id });
  return updated.length > 0;
};

/**
 * Merge a patch into `metadata.remoteAdmission`, fenced by the transition
 * table above. Returns whether the row was updated — `false` means the
 * current ledger state does not permit this transition and the write was
 * dropped (stale/duplicate signal), which callers treat as a no-op.
 */
export const writeRemoteRunAdmission = async (
  db: LobeChatDatabase,
  operationId: string,
  patch: Partial<RemoteRunAdmission> & { state: AgentRunAdmissionState },
): Promise<boolean> => {
  const allowedSources = ADMISSION_TRANSITION_SOURCES[patch.state];

  const updated = await db
    .update(agentOperations)
    .set({
      metadata: mergeSubkey(REMOTE_RUN_ADMISSION_KEY, {
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
    })
    .where(
      and(
        eq(agentOperations.id, operationId),
        allowedSources.length > 0
          ? sql`coalesce(${agentOperations.metadata} -> ${REMOTE_RUN_ADMISSION_KEY} ->> 'state', '') IN (${sql.join(
              allowedSources.map((s) => sql`${s}`),
              sql`, `,
            )})`
          : sql`1 = 0`,
      ),
    )
    .returning({ id: agentOperations.id });

  if (updated.length === 0) {
    log('remoteAdmission write skipped op=%s state=%s (guard)', operationId, patch.state);
    return false;
  }
  return true;
};

/** First producer callback — the run demonstrably reached the host. */
export const markRemoteRunRunning = async (
  db: LobeChatDatabase,
  operationId: string,
): Promise<boolean> => writeRemoteRunAdmission(db, operationId, { state: 'running' });

/**
 * Merge non-state fields (e.g. `acpSessionId` learned mid-run) into the
 * admission record without touching its state. Guarded only on the record
 * existing — never creates one.
 */
export const patchRemoteRunAdmission = async (
  db: LobeChatDatabase,
  operationId: string,
  patch: Partial<Omit<RemoteRunAdmission, 'state' | 'idempotencyKey' | 'generation' | 'channel'>>,
): Promise<boolean> => {
  const updated = await db
    .update(agentOperations)
    .set({
      metadata: mergeSubkey(REMOTE_RUN_ADMISSION_KEY, {
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
    })
    .where(
      and(
        eq(agentOperations.id, operationId),
        sql`${agentOperations.metadata} -> ${REMOTE_RUN_ADMISSION_KEY} IS NOT NULL`,
      ),
    )
    .returning({ id: agentOperations.id });
  return updated.length > 0;
};

/**
 * Record that a cancel signal was dispatched for a remote-admitted run.
 * No-op for operations without an admission record (pure in-process runtimes)
 * and never rewrites a `confirmed` cancel; a retry after an `unknown` outcome
 * re-arms `requested` (clearing the stale `resolvedAt`).
 */
export const markRemoteCancelRequested = async (
  db: LobeChatDatabase,
  operationId: string,
  reason?: string,
): Promise<boolean> => {
  const updated = await db
    .update(agentOperations)
    .set({
      metadata: mergeSubkey(REMOTE_RUN_CANCEL_KEY, {
        reason,
        requestedAt: new Date().toISOString(),
        resolvedAt: null,
        state: 'requested',
      }),
    })
    .where(
      and(
        eq(agentOperations.id, operationId),
        sql`${agentOperations.metadata} -> ${REMOTE_RUN_ADMISSION_KEY} IS NOT NULL`,
        sql`coalesce(${agentOperations.metadata} -> ${REMOTE_RUN_CANCEL_KEY} ->> 'state', '') <> 'confirmed'`,
      ),
    )
    .returning({ id: agentOperations.id });
  return updated.length > 0;
};

/**
 * Resolve a pending cancel to `confirmed` or `unknown`. A `requested` record
 * may resolve either way; an `unknown` record may still upgrade to
 * `confirmed` when the host's terminal callback later proves the process
 * stopped — but `confirmed` is terminal and never regresses.
 */
export const resolveRemoteCancel = async (
  db: LobeChatDatabase,
  operationId: string,
  state: 'confirmed' | 'unknown',
  reason?: string,
): Promise<boolean> => {
  const sources = state === 'confirmed' ? ['requested', 'unknown'] : ['requested'];

  const updated = await db
    .update(agentOperations)
    .set({
      metadata: mergeSubkey(REMOTE_RUN_CANCEL_KEY, {
        reason,
        resolvedAt: new Date().toISOString(),
        state,
      }),
    })
    .where(
      and(
        eq(agentOperations.id, operationId),
        sql`${agentOperations.metadata} -> ${REMOTE_RUN_CANCEL_KEY} ->> 'state' IN (${sql.join(
          sources.map((s) => sql`${s}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: agentOperations.id });
  return updated.length > 0;
};

// ── Readers ─────────────────────────────────────────────────────────────────

/**
 * Load the admission + cancel ledger for an operation row, for status
 * surfacing and generation fencing. Returns `undefined` when the operation
 * does not exist or is not a remote-admitted run.
 */
export const loadRemoteRunRecord = async (
  db: LobeChatDatabase,
  operationId: string,
): Promise<
  { admission?: RemoteRunAdmission; cancel?: RemoteRunCancel; status?: string } | undefined
> => {
  const [row] = await db
    .select({ metadata: agentOperations.metadata, status: agentOperations.status })
    .from(agentOperations)
    .where(eq(agentOperations.id, operationId))
    .limit(1);
  if (!row) return undefined;
  return {
    admission: readRemoteRunAdmission(row.metadata),
    cancel: readRemoteRunCancel(row.metadata),
    status: row.status,
  };
};

/**
 * Generation fence for producer callbacks. Returns false when the caller
 * asserts a generation that does not match the admitted one — the callback is
 * a stale writer and must be dropped. Operations without an admission record
 * (or callers that omit the generation) are grandfathered.
 */
export const remoteRunGenerationMatches = async (
  db: LobeChatDatabase,
  operationId: string,
  runGeneration?: number,
): Promise<boolean> => {
  if (runGeneration == null) return true;
  const record = await loadRemoteRunRecord(db, operationId);
  if (!record?.admission) return true;
  return record.admission.generation === runGeneration;
};

/**
 * The status surface for a remote run: the durable admission + cancel ledger
 * plus the stream tail cursor a reconnect would resume from.
 */
export const loadRemoteExecutionStatus = async (
  db: LobeChatDatabase,
  streamManager: IStreamEventManager,
  operationId: string,
): Promise<RemoteExecutionStatus | undefined> => {
  const record = await loadRemoteRunRecord(db, operationId);
  if (!record?.admission) return undefined;

  let eventCursor: string | undefined;
  try {
    const tail = await streamManager.getStreamHistory(operationId, 1);
    eventCursor = tail[0]?.id;
  } catch (error) {
    log('loadRemoteExecutionStatus: stream tail read failed op=%s: %O', operationId, error);
  }

  return {
    admission: record.admission,
    cancel: record.cancel,
    eventCursor,
  };
};

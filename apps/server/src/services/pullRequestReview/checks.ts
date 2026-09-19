/**
 * Shared check-run / status-context normalization for the PR review surface.
 *
 * The raw GraphQL `statusCheckRollup.contexts` connection is a union of
 * `CheckRun` (status + conclusion) and legacy `StatusContext` (state only).
 * Rendering either family directly mixes vocabularies — the cardinal bug was
 * counting "conclusion not in a passing whitelist" as a failure, which scores
 * QUEUED/IN_PROGRESS runs (conclusion: null) as non-failures and can display
 * a fully-queued rollup as "checks passing".
 *
 * Contract:
 * - "not yet failed" is NEVER "passed" — pending/queued/expected stay pending.
 * - Legacy StatusContext FAILURE/ERROR live in `state`, not `conclusion`.
 * - Incomplete vendor data (a page we haven't loaded) degrades the aggregate
 *   to 'partial' instead of green.
 */

export type NormalizedCheckStatus = 'failing' | 'passed' | 'pending' | 'unknown';

export interface RawCheckContext {
  __typename?: string | null;
  completedAt?: string | null;
  conclusion?: string | null;
  context?: string | null;
  detailsUrl?: string | null;
  name?: string | null;
  startedAt?: string | null;
  state?: string | null;
  status?: string | null;
  targetUrl?: string | null;
}

export interface NormalizedCheck {
  detailsUrl: string | null;
  name: string;
  /** The vendor's conclusion value (CheckRun) — kept for the detail row. */
  rawConclusion: string | null;
  /** The vendor's in-flight status/state value — kept for the detail row. */
  rawStatus: string | null;
  status: NormalizedCheckStatus;
}

const PASSING_CHECK_CONCLUSIONS = new Set(['NEUTRAL', 'SKIPPED', 'STALE', 'SUCCESS']);
const FAILING_CHECK_CONCLUSIONS = new Set([
  'ACTION_REQUIRED',
  'CANCELLED',
  'FAILURE',
  'STARTUP_FAILURE',
  'TIMED_OUT',
]);
const PENDING_CHECK_STATUSES = new Set([
  'IN_PROGRESS',
  'PENDING',
  'QUEUED',
  'REQUESTED',
  'WAITING',
]);

const PASSING_STATUS_CONTEXT_STATES = new Set(['SUCCESS']);
const FAILING_STATUS_CONTEXT_STATES = new Set(['ERROR', 'FAILURE']);
const PENDING_STATUS_CONTEXT_STATES = new Set(['EXPECTED', 'PENDING']);

const isStatusContext = (context: RawCheckContext): boolean =>
  context.__typename === 'StatusContext' ||
  (context.state !== null && context.state !== undefined && context.status == null);

/**
 * Reduce a raw union member to one status vocabulary. `CheckRun.status` is a
 * lifecycle (QUEUED…COMPLETED) while `conclusion` only exists after COMPLETED;
 * `StatusContext.state` mixes both into one field.
 */
export const normalizeCheck = (context: RawCheckContext): NormalizedCheck => {
  const name = context.name ?? context.context ?? 'check';
  const detailsUrl = context.detailsUrl ?? context.targetUrl ?? null;

  if (isStatusContext(context)) {
    const state = context.state ?? null;
    const status = PASSING_STATUS_CONTEXT_STATES.has(state ?? '')
      ? 'passed'
      : FAILING_STATUS_CONTEXT_STATES.has(state ?? '')
        ? 'failing'
        : PENDING_STATUS_CONTEXT_STATES.has(state ?? '')
          ? 'pending'
          : 'unknown';
    return { detailsUrl, name, rawConclusion: null, rawStatus: state, status };
  }

  const conclusion = context.conclusion ?? null;
  const status = context.status ?? null;

  let normalized: NormalizedCheckStatus;
  if (conclusion) {
    normalized = PASSING_CHECK_CONCLUSIONS.has(conclusion)
      ? 'passed'
      : FAILING_CHECK_CONCLUSIONS.has(conclusion)
        ? 'failing'
        : 'unknown';
  } else if (status === 'COMPLETED') {
    // A completed run with no conclusion is vendor-corrupt data, not a pass.
    normalized = 'unknown';
  } else if (status && PENDING_CHECK_STATUSES.has(status)) {
    normalized = 'pending';
  } else if (!status && !conclusion) {
    normalized = 'unknown';
  } else {
    normalized = 'pending';
  }

  return { detailsUrl, name, rawConclusion: conclusion, rawStatus: status, status: normalized };
};

export type AggregateCheckState = 'failing' | 'partial' | 'passed' | 'pending' | 'unknown';

export interface CheckSummary {
  failing: number;
  /** true when the loaded set is complete (no further vendor pages). */
  loaded: boolean;
  passed: number;
  pending: number;
  state: AggregateCheckState;
  total: number;
  unknown: number;
}

/**
 * Aggregate normalized checks into one rollup state for the header line.
 *
 * Ordering matters: a real failure is always reported; "we haven't loaded
 * every check" can never claim `passed`; anything still running is `pending`;
 * only a fully-loaded, fully-passed set is `passed`.
 */
export const aggregateChecks = (
  checks: readonly NormalizedCheck[],
  { complete }: { complete: boolean },
): CheckSummary => {
  const summary: CheckSummary = {
    failing: 0,
    loaded: complete,
    passed: 0,
    pending: 0,
    state: 'unknown',
    total: checks.length,
    unknown: 0,
  };
  for (const check of checks) {
    summary[check.status] += 1;
  }

  if (summary.total === 0) {
    summary.state = 'unknown';
  } else if (summary.failing > 0) {
    summary.state = 'failing';
  } else if (!complete) {
    summary.state = 'partial';
  } else if (summary.pending > 0) {
    summary.state = 'pending';
  } else if (summary.unknown > 0) {
    summary.state = 'unknown';
  } else {
    summary.state = 'passed';
  }
  return summary;
};

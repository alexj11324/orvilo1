import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { taskDispatches, tasks } from '../schemas/task';

/**
 * Canonical execution-layer SQL fragments — the SQL mirror of
 * `deriveTaskExecutionState` (packages/types). `tasks.status` is retired:
 * every "is this task running/parked/final" question is answered from
 * `task_dispatches` / `workflowCategory` / the parked marker, never the
 * legacy column. Keep the phase vocabularies in sync with
 * `DISPATCH_PHASE_EXECUTION` in packages/types/src/task/stateModel.ts.
 */

/**
 * Dispatch phases that still own the task's run lease — anything that has not
 * reached a settled terminal phase. `outcome_unknown` stays in the set: an
 * unresolved outcome is conservatively treated as still owned, matching the
 * established intake/sweep idiom.
 */
export const ACTIVE_DISPATCH_PHASES = [
  'requested',
  'claimed',
  'provisioning',
  'dispatched',
  'running',
  'waiting',
  'cancel_requested',
  'outcome_unknown',
] as const;

/**
 * Terminal dispatch phases that mean "the run ended badly or was parked" —
 * one half of the canonical parked answer (the other half is the parked
 * marker below). A task whose latest outcome is one of these needs attention
 * before it runs again.
 */
export const UNRESOLVED_DISPATCH_PHASES = [
  'failed',
  'canceled',
  'abandoned',
  'outcome_unknown',
] as const;

/** The task is open on the Issue Status axis — the canonical "not final". */
export const TASK_OPEN_WORKFLOW = sql`${tasks.workflowCategory} NOT IN ('done', 'canceled')`;

/** An execution generation currently owns the task (SQL `EXISTS` fragment). */
export const hasActiveExecution = sql`EXISTS (
  SELECT 1 FROM ${taskDispatches} active
  WHERE active.task_id = ${tasks.id}
    AND active.phase IN ('requested', 'claimed', 'provisioning', 'dispatched', 'running', 'waiting', 'cancel_requested', 'outcome_unknown')
)`;

/** Scalar: the phase of the task's most recent dispatch, or NULL when it never ran. */
export const latestDispatchPhase = sql`(
  SELECT d.phase FROM ${taskDispatches} d
  WHERE d.task_id = ${tasks.id}
  ORDER BY d.generation DESC, d.created_at DESC
  LIMIT 1
)`;

/** The latest run ended abnormally (failed/canceled/abandoned/unknown). */
export const hasUnresolvedExecution = sql`coalesce(${latestDispatchPhase}, '') IN ('failed', 'canceled', 'abandoned', 'outcome_unknown')`;

/**
 * Parked marker — the canonical persistence of the retired `status='paused'`
 * intent. Park transitions stamp `context.execution.parked`; every claim or
 * transition away clears it. Presence of the key is the flag (cleared by
 * removal, never by writing JSON null).
 */
export const isParked = sql`(${tasks.context} -> 'execution' -> 'parked') IS NOT NULL`;

/**
 * Parked — canonical form of `status = 'paused'`: either an explicit park
 * stamped the marker (covers tasks that never ran, e.g. checkpoint holds), or
 * the latest run ended abnormally with no live generation. Sweep predicates
 * that need "needs attention" use this broad form; per-status buckets narrow
 * it further via the parked `reason` category.
 */
export const isExecutionParked = sql`(${isParked} OR (
  NOT ${hasActiveExecution} AND ${hasUnresolvedExecution}
))`;

/** The parked marker carries the `failed` category — a failed park, not a pause. */
export const parkedIsFailed = sql`coalesce(${tasks.context} #>> '{execution,parked,reason}', '') = 'failed'`;

/**
 * Automation still armed for a future tick — canonical form of
 * `status = 'scheduled'`: automation mode set, the scheduler's tick token
 * armed in `context.scheduler`, no live run, not parked.
 */
export const isAutomationArmed = sql`(
  ${tasks.automationMode} IS NOT NULL
  AND ${tasks.context} #>> '{scheduler,tickToken}' IS NOT NULL
  AND NOT ${hasActiveExecution}
  AND NOT ${isParked}
)`;

/** A live execution generation owns the task — canonical `status = 'running'`. */
export const isExecutionLive = hasActiveExecution;

/**
 * Translate a retired `tasks.status` vocabulary value into its canonical
 * predicate — keeps API/list/group consumers that still pass legacy status
 * names working without ever reading the column. Unknown values match nothing.
 */
export const predicateForLegacyStatus = (status: string): SQL | undefined => {
  switch (status) {
    case 'backlog': {
      return sql`${TASK_OPEN_WORKFLOW} AND NOT ${hasActiveExecution} AND NOT ${isExecutionParked} AND NOT ${isAutomationArmed}`;
    }
    case 'scheduled': {
      return isAutomationArmed;
    }
    case 'running': {
      return sql`${hasActiveExecution} AND NOT ${isParked}`;
    }
    case 'paused': {
      return sql`(${isParked} AND NOT ${parkedIsFailed})
        OR (NOT ${isParked} AND NOT ${hasActiveExecution} AND ${latestDispatchPhase} IN ('canceled', 'abandoned', 'outcome_unknown'))`;
    }
    case 'failed': {
      return sql`${parkedIsFailed} OR (NOT ${isParked} AND NOT ${hasActiveExecution} AND ${latestDispatchPhase} = 'failed')`;
    }
    case 'completed': {
      return sql`${tasks.workflowCategory} = 'done'`;
    }
    case 'canceled': {
      return sql`${tasks.workflowCategory} = 'canceled'`;
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The deprecated `status` label a task would have carried, computed from
 * canonical fields — for response/lane projections that still expose the old
 * vocabulary to a real consumer. Never reads `tasks.status`.
 */
export const legacyStatusExpr = sql`case
  when ${tasks.workflowCategory} = 'done' then 'completed'
  when ${tasks.workflowCategory} = 'canceled' then 'canceled'
  when ${parkedIsFailed} then 'failed'
  when ${isParked} then 'paused'
  when ${hasActiveExecution} then 'running'
  when ${latestDispatchPhase} = 'failed' then 'failed'
  when ${latestDispatchPhase} IN ('canceled', 'abandoned', 'outcome_unknown') then 'paused'
  when ${isAutomationArmed} then 'scheduled'
  else 'backlog'
end`;

/** OR-composed canonical predicate for a set of legacy status values. */
export const predicateForLegacyStatuses = (statuses: readonly string[]): SQL | undefined => {
  const parts = statuses
    .map((status) => predicateForLegacyStatus(status))
    .filter((part): part is SQL => part !== undefined);
  if (parts.length === 0) return undefined;
  return sql`(${sql.join(parts, sql` OR `)})`;
};

/**
 * Column-level SQL for writing/removing the parked marker inside an UPDATE.
 * Each write touches one path level so sibling keys (scheduler, …) survive;
 * multi-level `jsonb_set` paths are unreliable under the WASM engine that
 * backs tests.
 */
export const parkMarkerSet = (parked: { at: string; reason?: string }) =>
  sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb), '{execution}', coalesce(${tasks.context} -> 'execution', '{}'::jsonb) || ${JSON.stringify({ parked })}::jsonb)`;

export const parkMarkerClear = sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb), '{execution}', coalesce(${tasks.context} -> 'execution', '{}'::jsonb) - 'parked')`;

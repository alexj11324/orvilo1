import type { LinearInstallationStatus } from '@orvilo/types';
import { and, asc, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import {
  linearInstallations,
  linearSyncInbox,
  linearSyncOutbox,
  taskPlanningScopes,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

/** Keep a sweep small enough that one lost cron delivery cannot create a fan-out storm. */
export const LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS = 100;
export const LINEAR_SYNC_SWEEP_MAX_INSTALLATIONS = 100;
export const LINEAR_SYNC_SWEEP_DEFAULT_WORKFLOW_LIMIT = 20;
export const LINEAR_SYNC_SWEEP_MAX_WORKFLOW_LIMIT = 50;
export const LINEAR_SYNC_SWEEP_DEFAULT_SCHEDULE_LIMIT = 20;
export const LINEAR_SYNC_SWEEP_MAX_SCHEDULE_LIMIT = 20;
export const LINEAR_SYNC_SWEEP_ROTATION_MS = 60_000;

/** These match the rows accepted by LinearSyncModel.claimInbox. */
export const LINEAR_SYNC_SWEEP_INBOX_STATUSES = [
  'received',
  'pending_binding',
  'failed',
  'processing',
] as const;

/** These match the rows accepted by LinearSyncModel.claimOutbox. */
export const LINEAR_SYNC_SWEEP_OUTBOX_STATUSES = [
  'pending',
  'failed',
  'sending',
  'outcome_unknown',
] as const;

export interface LinearSyncBacklogSummary {
  count: number;
  oldestAt: Date | null;
}

export interface LinearSyncSweepInstallation {
  id: string;
  inbox: LinearSyncBacklogSummary;
  outbox: LinearSyncBacklogSummary;
  /** Only the first active installation in a workspace owns workspace planning wakeups. */
  planning: LinearSyncBacklogSummary;
  planningOwner: boolean;
  status: LinearInstallationStatus;
  workspaceId: string;
}

export interface LinearSyncPlanningBacklog {
  summary: LinearSyncBacklogSummary;
  workspaceId: string;
}

export interface LinearSyncSweepDiscovery {
  installations: LinearSyncSweepInstallation[];
  planningBacklog: LinearSyncPlanningBacklog[];
}

export interface LinearSyncSweepInstallationRecord {
  createdAt?: Date | string | null;
  id: string;
  status: LinearInstallationStatus;
  workspaceId: string;
}

export interface LinearSyncSweepAggregateRow {
  count: number | string | null;
  installationId: string;
  oldestAt: Date | string | null;
}

export interface LinearSyncPlanningAggregateRow {
  count: number | string | null;
  oldestAt: Date | string | null;
  workspaceId: string;
}

export interface LinearSyncSweepResult {
  actionableInstallations: number;
  activeInstallations: number;
  dryRun: boolean;
  failed: number;
  inactiveInstallations: number;
  inboxBacklog: number;
  oldestBacklogAt: string | null;
  outboxBacklog: number;
  planningBacklog: number;
  scannedInstallations: number;
  scheduled: number;
  skippedNoBacklog: number;
  truncated: number;
}

export type LinearSyncInstallationTrigger = (input: {
  installationId: string;
  limit: number;
  workspaceId: string;
}) => Promise<unknown>;

const EMPTY_BACKLOG: LinearSyncBacklogSummary = { count: 0, oldestAt: null };

const asCount = (value: number | string | null | undefined) => {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
};

const asDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const summaryFromRow = (row?: {
  count: number | string | null;
  oldestAt: Date | string | null;
}): LinearSyncBacklogSummary =>
  row ? { count: asCount(row.count), oldestAt: asDate(row.oldestAt) } : { ...EMPTY_BACKLOG };

const minDate = (...dates: Array<Date | null>) => {
  const present = dates.filter((date): date is Date => Boolean(date));
  if (present.length === 0) return null;
  return present.reduce((oldest, date) => (date < oldest ? date : oldest));
};

const normalizeLimit = (value: number, maximum: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
};

const hasAnyBacklog = (installation: LinearSyncSweepInstallation) =>
  installation.inbox.count > 0 ||
  installation.outbox.count > 0 ||
  (installation.planningOwner && installation.planning.count > 0);

const compareDates = (left: Date | null, right: Date | null) => {
  if (left && right) return left.getTime() - right.getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
};

/**
 * Convert claimable aggregate rows into bounded installation candidates.
 * Queue aggregates are already filtered by the authoritative availableAt and
 * lease predicates in discoverLinearSyncSweepInstallations.
 */
export const selectLinearSyncSweepInstallations = (input: {
  inboxRows: readonly LinearSyncSweepAggregateRow[];
  installations: readonly LinearSyncSweepInstallationRecord[];
  maxInstallations?: number;
  now?: Date;
  outboxRows: readonly LinearSyncSweepAggregateRow[];
  planningRows: readonly LinearSyncPlanningAggregateRow[];
}): LinearSyncSweepDiscovery => {
  const maxInstallations = normalizeLimit(
    input.maxInstallations ?? LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
    LINEAR_SYNC_SWEEP_MAX_INSTALLATIONS,
    LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
  );
  const now = input.now ?? new Date();
  const inboxByInstallation = new Map(
    input.inboxRows.map((row) => [row.installationId, summaryFromRow(row)]),
  );
  const outboxByInstallation = new Map(
    input.outboxRows.map((row) => [row.installationId, summaryFromRow(row)]),
  );
  const planningByWorkspace = new Map(
    input.planningRows.map((row) => [row.workspaceId, summaryFromRow(row)]),
  );

  const candidateRecords = input.installations
    .filter((installation) => {
      const inbox = inboxByInstallation.get(installation.id);
      const outbox = outboxByInstallation.get(installation.id);
      const planning = planningByWorkspace.get(installation.workspaceId);
      return Boolean(inbox?.count || outbox?.count || planning?.count);
    })
    .sort((left, right) => {
      const leftOldest = minDate(
        inboxByInstallation.get(left.id)?.oldestAt ?? null,
        outboxByInstallation.get(left.id)?.oldestAt ?? null,
        planningByWorkspace.get(left.workspaceId)?.oldestAt ?? null,
      );
      const rightOldest = minDate(
        inboxByInstallation.get(right.id)?.oldestAt ?? null,
        outboxByInstallation.get(right.id)?.oldestAt ?? null,
        planningByWorkspace.get(right.workspaceId)?.oldestAt ?? null,
      );
      return compareDates(leftOldest, rightOldest) || left.id.localeCompare(right.id);
    });
  const rotation =
    candidateRecords.length > maxInstallations
      ? Math.floor(now.getTime() / LINEAR_SYNC_SWEEP_ROTATION_MS) % candidateRecords.length
      : 0;
  const selectedRecords = [
    ...candidateRecords.slice(rotation),
    ...candidateRecords.slice(0, rotation),
  ].slice(0, maxInstallations);
  const planningOwnerByWorkspace = new Map<string, string>();

  for (const installation of selectedRecords) {
    if (
      installation.status === 'active' &&
      !planningOwnerByWorkspace.has(installation.workspaceId)
    ) {
      planningOwnerByWorkspace.set(installation.workspaceId, installation.id);
    }
  }

  return {
    installations: selectedRecords.map((installation) => ({
      id: installation.id,
      inbox: inboxByInstallation.get(installation.id) ?? { ...EMPTY_BACKLOG },
      outbox: outboxByInstallation.get(installation.id) ?? { ...EMPTY_BACKLOG },
      planning: planningByWorkspace.get(installation.workspaceId) ?? { ...EMPTY_BACKLOG },
      planningOwner: planningOwnerByWorkspace.get(installation.workspaceId) === installation.id,
      status: installation.status,
      workspaceId: installation.workspaceId,
    })),
    planningBacklog: [...planningByWorkspace.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([workspaceId, summary]) => ({ summary, workspaceId })),
  };
};

/**
 * Find durable queue work that is claimable right now.
 *
 * The predicates intentionally mirror the model claim queries. This is a
 * read-only safety net: it never clears a lease, changes availableAt, or
 * changes a queue status. A row with a live lease is therefore absent from
 * the wakeup aggregate and cannot be rescheduled by this sweep.
 */
export const discoverLinearSyncSweepInstallations = async (
  db: OrviloDatabase,
  options: { maxInstallations?: number; now?: Date } = {},
): Promise<LinearSyncSweepDiscovery> => {
  const maxInstallations = normalizeLimit(
    options.maxInstallations ?? LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
    LINEAR_SYNC_SWEEP_MAX_INSTALLATIONS,
    LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
  );
  const now = options.now ?? new Date();

  const [inboxRows, outboxRows, planningRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`,
        installationId: linearSyncInbox.installationId,
        oldestAt: sql<Date | null>`min(${linearSyncInbox.createdAt})`,
      })
      .from(linearSyncInbox)
      .where(
        and(
          inArray(linearSyncInbox.status, [...LINEAR_SYNC_SWEEP_INBOX_STATUSES]),
          lte(linearSyncInbox.availableAt, now),
          or(isNull(linearSyncInbox.lockedUntil), lt(linearSyncInbox.lockedUntil, now)),
        ),
      )
      .groupBy(linearSyncInbox.installationId),
    db
      .select({
        count: sql<number>`count(*)::int`,
        installationId: linearSyncOutbox.installationId,
        oldestAt: sql<Date | null>`min(${linearSyncOutbox.createdAt})`,
      })
      .from(linearSyncOutbox)
      .where(
        and(
          inArray(linearSyncOutbox.status, [...LINEAR_SYNC_SWEEP_OUTBOX_STATUSES]),
          lte(linearSyncOutbox.availableAt, now),
          or(isNull(linearSyncOutbox.lockedUntil), lt(linearSyncOutbox.lockedUntil, now)),
        ),
      )
      .groupBy(linearSyncOutbox.installationId),
    db
      .select({
        count: sql<number>`count(*)::int`,
        oldestAt: sql<Date | null>`min(${taskPlanningScopes.createdAt})`,
        workspaceId: taskPlanningScopes.workspaceId,
      })
      .from(taskPlanningScopes)
      .where(
        and(
          gt(taskPlanningScopes.dirtyRevision, taskPlanningScopes.plannedRevision),
          or(
            eq(taskPlanningScopes.status, 'queued'),
            and(
              eq(taskPlanningScopes.status, 'running'),
              or(isNull(taskPlanningScopes.lockedUntil), lt(taskPlanningScopes.lockedUntil, now)),
            ),
          ),
        ),
      )
      .groupBy(taskPlanningScopes.workspaceId),
  ]);
  const candidateInstallationIds = [
    ...new Set([...inboxRows, ...outboxRows].map((row) => row.installationId)),
  ];
  const planningWorkspaceIds = planningRows.map((row) => row.workspaceId);
  if (candidateInstallationIds.length === 0 && planningWorkspaceIds.length === 0) {
    return { installations: [], planningBacklog: [] };
  }

  const installationFilter =
    candidateInstallationIds.length > 0 && planningWorkspaceIds.length > 0
      ? or(
          inArray(linearInstallations.id, candidateInstallationIds),
          inArray(linearInstallations.workspaceId, planningWorkspaceIds),
        )
      : candidateInstallationIds.length > 0
        ? inArray(linearInstallations.id, candidateInstallationIds)
        : inArray(linearInstallations.workspaceId, planningWorkspaceIds);
  const installations = await db
    .select({
      createdAt: linearInstallations.createdAt,
      id: linearInstallations.id,
      status: linearInstallations.status,
      workspaceId: linearInstallations.workspaceId,
    })
    .from(linearInstallations)
    .where(installationFilter)
    .orderBy(asc(linearInstallations.createdAt), asc(linearInstallations.id));

  return selectLinearSyncSweepInstallations({
    inboxRows,
    installations,
    maxInstallations,
    now,
    outboxRows,
    planningRows,
  });
};

/**
 * Trigger one installation workflow per actionable installation. Queue rows
 * are deliberately not passed into the trigger; the existing leased worker
 * discovers and claims a bounded batch when it starts.
 */
export const sweepLinearSyncInstallations = async (input: {
  dryRun?: boolean;
  installations: readonly LinearSyncSweepInstallation[];
  maxScheduledInstallations?: number;
  planningBacklog?: readonly LinearSyncPlanningBacklog[];
  triggerInstallation?: LinearSyncInstallationTrigger;
  workflowLimit?: number;
}): Promise<LinearSyncSweepResult> => {
  const uniqueInstallations = [
    ...new Map(input.installations.map((item) => [item.id, item])).values(),
  ];
  const activeInstallations = uniqueInstallations.filter(
    (installation) => installation.status === 'active',
  );
  const actionable = activeInstallations.filter(
    (installation) =>
      installation.inbox.count > 0 ||
      installation.outbox.count > 0 ||
      (installation.planningOwner && installation.planning.count > 0),
  );
  const maxScheduledInstallations = normalizeLimit(
    input.maxScheduledInstallations ?? LINEAR_SYNC_SWEEP_DEFAULT_SCHEDULE_LIMIT,
    LINEAR_SYNC_SWEEP_MAX_SCHEDULE_LIMIT,
    LINEAR_SYNC_SWEEP_DEFAULT_SCHEDULE_LIMIT,
  );
  const selected = actionable.slice(0, maxScheduledInstallations);
  const workflowLimit = normalizeLimit(
    input.workflowLimit ?? LINEAR_SYNC_SWEEP_DEFAULT_WORKFLOW_LIMIT,
    LINEAR_SYNC_SWEEP_MAX_WORKFLOW_LIMIT,
    LINEAR_SYNC_SWEEP_DEFAULT_WORKFLOW_LIMIT,
  );
  const planningOwners = uniqueInstallations.filter(
    (installation) => installation.status === 'active' && installation.planningOwner,
  );
  const inboxBacklog = activeInstallations.reduce(
    (total, installation) => total + installation.inbox.count,
    0,
  );
  const outboxBacklog = activeInstallations.reduce(
    (total, installation) => total + installation.outbox.count,
    0,
  );
  const planningBacklog = planningOwners.reduce(
    (total, installation) => total + installation.planning.count,
    0,
  );
  const observedPlanningBacklog =
    input.planningBacklog ??
    planningOwners.map((installation) => ({
      summary: installation.planning,
      workspaceId: installation.workspaceId,
    }));
  const totalPlanningBacklog = observedPlanningBacklog.reduce(
    (total, item) => total + item.summary.count,
    0,
  );
  const oldestPlanningBacklogAt = minDate(
    ...observedPlanningBacklog.map((item) => item.summary.oldestAt),
  );
  const oldestBacklogAt = minDate(
    ...activeInstallations.flatMap((installation) => [
      installation.inbox.oldestAt,
      installation.outbox.oldestAt,
    ]),
    oldestPlanningBacklogAt,
  );

  const result: LinearSyncSweepResult = {
    actionableInstallations: actionable.length,
    activeInstallations: activeInstallations.length,
    dryRun: input.dryRun === true,
    failed: 0,
    inboxBacklog,
    inactiveInstallations: uniqueInstallations.filter(
      (installation) => installation.status !== 'active',
    ).length,
    oldestBacklogAt: oldestBacklogAt?.toISOString() ?? null,
    outboxBacklog,
    planningBacklog: input.planningBacklog ? totalPlanningBacklog : planningBacklog,
    scannedInstallations: uniqueInstallations.length,
    scheduled: 0,
    skippedNoBacklog: activeInstallations.length - actionable.length,
    truncated: actionable.length - selected.length,
  };

  if (result.dryRun || selected.length === 0) return result;
  if (!input.triggerInstallation) throw new Error('Linear sync sweep trigger is required');

  const outcomes = await Promise.allSettled(
    selected.map((installation) =>
      input.triggerInstallation!({
        installationId: installation.id,
        limit: workflowLimit,
        workspaceId: installation.workspaceId,
      }),
    ),
  );
  result.scheduled = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
  result.failed = outcomes.length - result.scheduled;
  return result;
};

export const linearSyncInstallationHasBacklog = hasAnyBacklog;

import type { ProjectUpdate, TaskActivityLogType } from '@orvilo/types';

/**
 * One row of the paginated task field-change feed (`project.activityFeed`):
 * a `task_activities` event joined to its parent task, with the actor and any
 * assignment target already resolved server-side.
 */
export interface ActivityFeedRow {
  actor?: { avatar?: string | null; name?: string | null; type: 'agent' | 'user' } | null;
  createdAt: string;
  fromTarget?: { name?: string | null } | null;
  id: string;
  payload?: {
    actorKind?: 'agent' | 'system' | 'user';
    from?: unknown;
    fromId?: string | null;
    relationAction?: 'added' | 'removed';
    relationDirection?: 'blockedBy' | 'blocking';
    relationKind?: 'blocks' | 'relates';
    relationTargetIdentifier?: string | null;
    to?: unknown;
    toId?: string | null;
  } | null;
  target?: { avatar?: string | null; name?: string | null } | null;
  taskIdentifier: string;
  taskTitle: string;
  type: TaskActivityLogType;
}

/**
 * Project-level event kinds derived from detail data. There is no
 * project-scoped audit table, so each kind is backed by a timestamp or row
 * that already exists and means exactly what the row claims:
 *
 * - `milestone_added` ← `project_milestones.created_at` (an `updated_at` event
 *   would be dishonest — `reorderMilestones` rewrites it for pure reorders).
 * - `project_started`/`project_completed`/`project_archived` ← the projects
 *   row's transition columns. Only the *latest* transition survives: `reopen`
 *   clears `completedAt`, unarchive clears `archivedAt`, so a project that
 *   bounced between states shows just the current edge — the feed cannot
 *   claim a history that was never persisted.
 * - `review_accepted`/`review_rejected` ← `project_completion_reviews` rows.
 *   The reviewer is named only when they resolve to a current member; the row
 *   falls back to an actor-less sentence rather than guessing.
 * - `task_created` ← `tasks.created_at` + `created_by_snapshot`. For a task
 *   moved into the project later this is the task's creation instant, not the
 *   moment it joined — that moment is not recorded anywhere.
 */
export type ProjectFeedEventType =
  | 'milestone_added'
  | 'project_archived'
  | 'project_completed'
  | 'project_started'
  | 'review_accepted'
  | 'review_rejected'
  | 'task_created';

export interface ProjectFeedEvent {
  actorAvatar?: string;
  actorName?: string;
  createdAt: string;
  /** Unique feed key — derived ids are prefixed so they can never shadow a `task_activities` uuid. */
  id: string;
  milestoneId?: string;
  milestoneName?: string;
  taskIdentifier?: string;
  taskTitle?: string;
  type: ProjectFeedEventType;
}

export type ActivityFeedItem =
  | { kind: 'activity'; row: ActivityFeedRow }
  | { kind: 'event'; event: ProjectFeedEvent }
  | { kind: 'update'; update: ProjectUpdate };

/**
 * The slice of `ProjectDetail` the feed derives events from. Structural on
 * purpose: `Date | string` timestamps keep the helper usable on both the raw
 * server payload and plain test fixtures.
 */
export interface ProjectEventSource {
  completionReviews?:
    | readonly {
        createdAt?: Date | string | null;
        decision?: string | null;
        id: string;
        reviewerUserId?: string | null;
      }[]
    | null;
  members?:
    | readonly {
        avatar?: string | null;
        name?: string | null;
        userId: string;
      }[]
    | null;
  milestones?:
    | readonly {
        createdAt?: Date | string | null;
        id: string;
        name?: string | null;
      }[]
    | null;
  project: {
    archivedAt?: Date | string | null;
    completedAt?: Date | string | null;
    startedAt?: Date | string | null;
  };
  tasks?:
    | readonly {
        createdAt?: Date | string | null;
        createdBySnapshot?: { displayName?: string | null } | null;
        deletedAt?: Date | string | null;
        id: string;
        identifier?: string | null;
        instruction?: string | null;
        isDeleted?: boolean | null;
        name?: string | null;
      }[]
    | null;
}

const toIso = (value: Date | string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

/**
 * Derive project-level feed events from data the detail payload already
 * carries. Every event corresponds to a real row or column; nothing here
 * invents an event the database did not record.
 */
export const deriveProjectEvents = (source: ProjectEventSource): ProjectFeedEvent[] => {
  const events: ProjectFeedEvent[] = [];
  const memberById = new Map(
    (source.members ?? []).map((member) => [member.userId, member] as const),
  );

  for (const milestone of source.milestones ?? []) {
    const createdAt = toIso(milestone.createdAt);
    if (!createdAt) continue;
    events.push({
      createdAt,
      id: `milestone-added-${milestone.id}`,
      milestoneId: milestone.id,
      milestoneName: milestone.name ?? undefined,
      type: 'milestone_added',
    });
  }

  const lifecycle: [ProjectFeedEventType, Date | string | null | undefined][] = [
    ['project_started', source.project.startedAt],
    ['project_completed', source.project.completedAt],
    ['project_archived', source.project.archivedAt],
  ];
  for (const [type, stamp] of lifecycle) {
    const createdAt = toIso(stamp);
    if (createdAt) events.push({ createdAt, id: type, type });
  }

  for (const review of source.completionReviews ?? []) {
    const createdAt = toIso(review.createdAt);
    if (!createdAt) continue;
    const reviewer = review.reviewerUserId ? memberById.get(review.reviewerUserId) : undefined;
    events.push({
      actorAvatar: reviewer?.avatar ?? undefined,
      actorName: reviewer?.name ?? undefined,
      createdAt,
      id: `review-${review.id}`,
      type: review.decision === 'rejected' ? 'review_rejected' : 'review_accepted',
    });
  }

  for (const task of source.tasks ?? []) {
    // Trashed tasks stay in `listTasks` output; a "task added" line for a row
    // the reader can no longer open would be a dead link, not an event.
    if (task.isDeleted === true || task.deletedAt) continue;
    const createdAt = toIso(task.createdAt);
    if (!createdAt) continue;
    events.push({
      actorName: task.createdBySnapshot?.displayName ?? undefined,
      createdAt,
      id: `task-created-${task.id}`,
      taskIdentifier: task.identifier ?? undefined,
      taskTitle: task.name || task.instruction || undefined,
      type: 'task_created',
    });
  }

  return events;
};

/**
 * The oldest instant the paginated activity feed has loaded. While
 * `nextCursor` is set, non-paginated items (updates, derived events) may only
 * join the stream inside the loaded window — an item older than the window
 * would pin itself above the "Load more" button even though rows older than
 * it are still waiting below it. With no cursor the feed is fully loaded and
 * every item sorts freely; with a cursor but no rows there is nothing to
 * misorder against, so the window is open.
 */
export const feedWindowStart = (
  rows: readonly { createdAt: string }[],
  nextCursor?: string | null,
): string | undefined => (nextCursor ? rows.at(-1)?.createdAt : undefined);

const itemCreatedAt = (item: ActivityFeedItem) =>
  item.kind === 'activity'
    ? item.row.createdAt
    : item.kind === 'update'
      ? item.update.createdAt
      : item.event.createdAt;

/**
 * Merge the three feed sources into one newest-first stream. Rows arrive
 * sorted already (keyset order); updates and derived events are clipped to
 * the loaded window before the merged list is sorted by `createdAt` desc.
 */
export const mergeActivityFeed = (input: {
  events?: readonly ProjectFeedEvent[];
  rows: readonly ActivityFeedRow[];
  updates?: readonly ProjectUpdate[];
  windowStart?: string;
}): ActivityFeedItem[] => {
  const inWindow = (createdAt: string) =>
    !input.windowStart || createdAt.localeCompare(input.windowStart) >= 0;

  const items: ActivityFeedItem[] = [
    ...input.rows.map((row) => ({ kind: 'activity' as const, row })),
    ...(input.events ?? [])
      .filter((event) => inWindow(event.createdAt))
      .map((event) => ({ kind: 'event' as const, event })),
    ...(input.updates ?? [])
      .filter((update) => inWindow(update.createdAt))
      .map((update) => ({ kind: 'update' as const, update })),
  ];

  return items.sort((a, b) => itemCreatedAt(b).localeCompare(itemCreatedAt(a)));
};

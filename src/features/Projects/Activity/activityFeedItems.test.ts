import type { ProjectUpdate } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import {
  type ActivityFeedRow,
  deriveProjectEvents,
  feedWindowStart,
  mergeActivityFeed,
} from './activityFeedItems';

const row = (id: string, createdAt: string): ActivityFeedRow => ({
  createdAt,
  id,
  taskIdentifier: `T-${id}`,
  taskTitle: `Task ${id}`,
  type: 'status',
});

const update = (id: string, createdAt: string): ProjectUpdate => ({
  authorId: 'u1',
  body: id,
  createdAt,
  id,
  kind: 'comment',
  projectId: 'p1',
});

describe('deriveProjectEvents', () => {
  it('emits a milestone-added event per milestone, timestamped at its creation', () => {
    const events = deriveProjectEvents({
      milestones: [
        { createdAt: '2026-09-01T10:00:00.000Z', id: 'm1', name: 'Beta' },
        { createdAt: '2026-09-02T10:00:00.000Z', id: 'm2', name: 'GA' },
      ],
      project: {},
    });
    expect(events).toEqual([
      {
        createdAt: '2026-09-01T10:00:00.000Z',
        id: 'milestone-added-m1',
        milestoneId: 'm1',
        milestoneName: 'Beta',
        type: 'milestone_added',
      },
      {
        createdAt: '2026-09-02T10:00:00.000Z',
        id: 'milestone-added-m2',
        milestoneId: 'm2',
        milestoneName: 'GA',
        type: 'milestone_added',
      },
    ]);
  });

  it('emits lifecycle events only for transition columns that are set', () => {
    const events = deriveProjectEvents({
      project: {
        archivedAt: undefined,
        completedAt: '2026-09-10T00:00:00.000Z',
        startedAt: '2026-09-05T00:00:00.000Z',
      },
    });
    expect(events.map((event) => event.type)).toEqual(['project_started', 'project_completed']);
  });

  it('resolves the reviewer through current members and falls back to no actor', () => {
    const events = deriveProjectEvents({
      completionReviews: [
        {
          createdAt: '2026-09-10T00:00:00.000Z',
          decision: 'accepted',
          id: 'r1',
          reviewerUserId: 'u1',
        },
        {
          createdAt: '2026-09-11T00:00:00.000Z',
          decision: 'rejected',
          id: 'r2',
          reviewerUserId: 'u9',
        },
      ],
      members: [{ avatar: 'a.png', name: 'Ada', userId: 'u1' }],
      project: {},
    });
    expect(events).toEqual([
      {
        actorAvatar: 'a.png',
        actorName: 'Ada',
        createdAt: '2026-09-10T00:00:00.000Z',
        id: 'review-r1',
        type: 'review_accepted',
      },
      {
        actorAvatar: undefined,
        actorName: undefined,
        createdAt: '2026-09-11T00:00:00.000Z',
        id: 'review-r2',
        type: 'review_rejected',
      },
    ]);
  });

  it('emits task-created events with the recorded creator, skipping trashed tasks', () => {
    const events = deriveProjectEvents({
      project: {},
      tasks: [
        {
          createdAt: '2026-09-03T00:00:00.000Z',
          createdBySnapshot: { displayName: 'Ada' },
          id: 't1',
          identifier: 'ORV-1',
          name: 'Ship it',
        },
        {
          createdAt: '2026-09-04T00:00:00.000Z',
          id: 't2',
          identifier: 'ORV-2',
          isDeleted: true,
          name: 'Trashed',
        },
        {
          createdAt: '2026-09-05T00:00:00.000Z',
          deletedAt: '2026-09-06T00:00:00.000Z',
          id: 't3',
          identifier: 'ORV-3',
        },
        { createdAt: undefined, id: 't4' },
      ],
    });
    expect(events).toEqual([
      {
        actorName: 'Ada',
        createdAt: '2026-09-03T00:00:00.000Z',
        id: 'task-created-t1',
        taskIdentifier: 'ORV-1',
        taskTitle: 'Ship it',
        type: 'task_created',
      },
    ]);
  });

  it('accepts Date timestamps and drops invalid ones', () => {
    const events = deriveProjectEvents({
      milestones: [{ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'm1', name: 'B' }],
      project: { startedAt: 'not-a-date' },
    });
    expect(events).toEqual([
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        id: 'milestone-added-m1',
        milestoneId: 'm1',
        milestoneName: 'B',
        type: 'milestone_added',
      },
    ]);
  });
});

describe('feedWindowStart', () => {
  it('opens the window once the feed is exhausted', () => {
    expect(feedWindowStart([row('a', '2026-09-20')], null)).toBeUndefined();
    expect(feedWindowStart([], 'page-2')).toBeUndefined();
  });

  it('bounds the window at the oldest loaded row while pages remain', () => {
    const rows = [row('new', '2026-09-20'), row('old', '2026-09-10')];
    expect(feedWindowStart(rows, 'page-2')).toBe('2026-09-10');
  });
});

describe('mergeActivityFeed', () => {
  it('sorts all sources newest-first', () => {
    const merged = mergeActivityFeed({
      events: [
        {
          createdAt: '2026-09-15T00:00:00.000Z',
          id: 'e1',
          type: 'milestone_added',
        },
      ],
      rows: [row('r1', '2026-09-20'), row('r2', '2026-09-10')],
      updates: [update('u1', '2026-09-18')],
    });
    expect(
      merged.map((item) =>
        item.kind === 'activity'
          ? item.row.id
          : item.kind === 'update'
            ? item.update.id
            : item.event.id,
      ),
    ).toEqual(['r1', 'u1', 'e1', 'r2']);
  });

  it('clips non-paginated items older than the loaded window', () => {
    const merged = mergeActivityFeed({
      events: [
        { createdAt: '2026-08-01T00:00:00.000Z', id: 'old-event', type: 'milestone_added' },
        { createdAt: '2026-09-12T00:00:00.000Z', id: 'in-window', type: 'task_created' },
      ],
      rows: [row('r1', '2026-09-20'), row('r2', '2026-09-10')],
      updates: [update('old-update', '2026-07-01')],
      windowStart: '2026-09-10',
    });
    expect(merged.map((item) => item.kind)).toEqual(['activity', 'event', 'activity']);
    expect(merged[1]).toMatchObject({ event: { id: 'in-window' } });
  });

  it('includes every item when the window is open', () => {
    const merged = mergeActivityFeed({
      events: [{ createdAt: '2020-01-01T00:00:00.000Z', id: 'e1', type: 'milestone_added' }],
      rows: [row('r1', '2026-09-20')],
      updates: [update('u1', '2020-06-01T00:00:00.000Z')],
    });
    expect(
      merged.map((item) =>
        item.kind === 'event'
          ? item.event.id
          : item.kind === 'update'
            ? item.update.id
            : item.row.id,
      ),
    ).toEqual(['r1', 'u1', 'e1']);
  });
});

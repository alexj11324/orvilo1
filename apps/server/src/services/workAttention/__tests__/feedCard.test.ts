import { describe, expect, it } from 'vitest';

import type { NotificationItem } from '@/database/schemas/notification';

import { toFeedCard } from '../feedCard';

const row = (overrides: Partial<NotificationItem> = {}): NotificationItem =>
  ({
    actionKind: null,
    actionRequestId: null,
    actionUrl: '/task/t1',
    activityVersion: 1,
    archivedAt: null,
    category: 'workspace',
    content: 'Assigned to you',
    context: null,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    dedupeKey: 'd1',
    episodeKey: 'task:t1:assignee',
    id: 'n1',
    isArchived: false,
    isRead: false,
    kind: 'update',
    lastActivityAt: new Date('2026-09-18T01:00:00Z'),
    latestFeedRevision: 1,
    metadata: null,
    projectionVersion: 1,
    readVersion: 0,
    resolvedAt: null,
    resourceId: 't1',
    resourceType: 'task',
    snoozedUntil: null,
    sourceEventId: 'evt-1',
    threadKey: null,
    title: 'Task assigned',
    type: 'task_assigned',
    updatedAt: new Date('2026-09-18T01:00:00Z'),
    userId: 'u1',
    workspaceId: 'ws1',
    ...overrides,
  }) as NotificationItem;

describe('toFeedCard', () => {
  it('keeps decide available only for unresolved action cards', () => {
    const update = toFeedCard(row());
    expect(update.availableActions).not.toContain('decide');
    expect(update.safeNavigation).toEqual({ kind: 'task', taskId: 't1' });

    const action = toFeedCard(
      row({
        actionKind: 'acp_permission',
        actionRequestId: 'apr_1',
        kind: 'action',
        type: 'acp_permission',
      }),
    );
    expect(action.availableActions).toContain('decide');
    expect(action.actionRef).toEqual({ kind: 'acp_permission', requestId: 'apr_1' });
  });

  it('does not treat an archived-but-unresolved action as already decided', () => {
    const card = toFeedCard(
      row({
        actionKind: 'acp_permission',
        actionRequestId: 'apr_1',
        isArchived: true,
        isRead: true,
        kind: 'action',
        resolvedAt: null,
      }),
    );
    expect(card.availableActions).toContain('decide');
    expect(card.read).toBe(true);
  });
});

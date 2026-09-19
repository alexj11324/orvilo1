import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationItem } from '@/database/schemas/notification';

import { buildInboxFeed } from '../feedPage';

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
    title: 'Stored name',
    type: 'task_assigned',
    updatedAt: new Date('2026-09-18T01:00:00Z'),
    userId: 'u1',
    workspaceId: 'ws1',
    ...overrides,
  }) as NotificationItem;

describe('buildInboxFeed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a partial envelope instead of an empty success when a source is down', async () => {
    const page = await buildInboxFeed({
      actionSources: {
        listPendingForActorSettled: async () => ({
          pending: [],
          unavailable: ['resource_transfer'],
        }),
      },
      notificationModel: {
        ensureActionCards: async () => undefined,
        listFeed: async () => [],
      },
      projectModel: { findByIds: async () => [] },
      taskModel: { findByIds: async () => [] },
    });

    expect(page.cards).toEqual([]);
    expect(page.partial).toBe(true);
    expect(page.sourceUnavailable).toEqual(['resource_transfer']);
    expect(page.lastReconciledAt).toEqual(expect.any(String));
  });

  it('overlays live task and project titles from findByIds', async () => {
    const page = await buildInboxFeed({
      actionSources: {
        listPendingForActorSettled: async () => ({ pending: [], unavailable: [] }),
      },
      notificationModel: {
        ensureActionCards: async () => undefined,
        listFeed: async () => [
          row(),
          row({
            id: 'n2',
            resourceId: 'p1',
            resourceType: 'project',
            title: 'Old project',
          }),
        ],
      },
      projectModel: { findByIds: async () => [{ id: 'p1', name: 'Live project' }] },
      taskModel: {
        findByIds: async () => [{ id: 't1', instruction: 'ignored', name: 'Live task' }],
      },
    });

    expect(page.partial).toBe(false);
    expect(page.cards.map((card) => card.title)).toEqual(['Live task', 'Live project']);
  });

  it('keeps stored titles when live lookup fails instead of emptying the feed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await buildInboxFeed({
      actionSources: {
        listPendingForActorSettled: async () => ({ pending: [], unavailable: [] }),
      },
      notificationModel: {
        ensureActionCards: async () => undefined,
        listFeed: async () => [row()],
      },
      projectModel: { findByIds: async () => [] },
      taskModel: {
        findByIds: async () => {
          throw new Error('acl lookup down');
        },
      },
    });
    error.mockRestore();

    expect(page.cards).toHaveLength(1);
    expect(page.cards[0]?.title).toBe('Stored name');
    expect(page.partial).toBe(false);
  });
});

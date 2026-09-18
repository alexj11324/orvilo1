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
    expect(action.decisionVerbs).toEqual(['approve', 'decline']);
  });

  it('keeps decide on ownership-transfer cards and opens members settings', () => {
    const card = toFeedCard(
      row({
        actionKind: 'workspace_ownership_transfer',
        actionRequestId: 'tr_1',
        actionUrl: null,
        kind: 'action',
        resourceId: 'ws1',
        resourceType: 'workspace',
        type: 'workspace_ownership_transfer',
      }),
    );
    expect(card.availableActions).toContain('decide');
    expect(card.actionRef).toEqual({
      kind: 'workspace_ownership_transfer',
      requestId: 'tr_1',
    });
    expect(card.safeNavigation).toEqual({ kind: 'url', url: '/settings/members' });
  });

  it('keeps decide on ACP intervention cards', () => {
    const card = toFeedCard(
      row({
        actionKind: 'acp_intervention',
        actionRequestId: '11111111-1111-1111-1111-111111111111',
        kind: 'action',
        type: 'acp_intervention',
      }),
    );
    expect(card.availableActions).toContain('decide');
    expect(card.actionRef).toEqual({
      kind: 'acp_intervention',
      requestId: '11111111-1111-1111-1111-111111111111',
    });
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

  it('pins sourceRevision and cancel-only verbs onto outgoing transfers', () => {
    const card = toFeedCard(
      row({
        actionKind: 'resource_transfer',
        actionRequestId: 'xfer_1',
        kind: 'action',
        type: 'resource_transfer',
      }),
      { outgoing: true, sourceRevision: 'xfer_1' },
    );
    expect(card.actionRef).toEqual({
      kind: 'resource_transfer',
      requestId: 'xfer_1',
      sourceRevision: 'xfer_1',
    });
    expect(card.decisionVerbs).toEqual(['cancel']);
  });

  it('asks for submit_input on acp_input cards instead of approve', () => {
    const card = toFeedCard(
      row({
        actionKind: 'acp_input',
        actionRequestId: 'task_1',
        kind: 'action',
        type: 'acp_input',
      }),
    );
    expect(card.decisionVerbs).toEqual(['submit_input']);
  });
});

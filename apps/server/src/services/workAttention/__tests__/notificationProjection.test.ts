import { describe, expect, it } from 'vitest';

import type { EventOutboxItem } from '@/database/schemas/eventOutbox';

import { resolveNotificationTargets } from '../notificationProjection';

const event = (overrides: Partial<EventOutboxItem> = {}): EventOutboxItem =>
  ({
    aggregateId: 'ws1',
    aggregateType: 'workspace',
    attempts: 0,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    deliveredAt: null,
    eventId: 'evt-1',
    eventType: 'workspace.ownership_transfer.requested',
    id: 'out-1',
    nextAttemptAt: null,
    payload: {},
    status: 'pending',
    workspaceId: 'ws1',
    ...overrides,
  }) as EventOutboxItem;

describe('resolveNotificationTargets', () => {
  it('projects an ownership-transfer request to the invited member as an action card', () => {
    const targets = resolveNotificationTargets(
      event({
        payload: { toUserId: 'admin-1', transferId: 'tr_1' },
      }),
    );

    expect(targets).toEqual([
      expect.objectContaining({
        actionKind: 'workspace_ownership_transfer',
        actionRequestId: 'tr_1',
        kind: 'action',
        recipientUserId: 'admin-1',
        type: 'workspace_ownership_transfer',
      }),
    ]);
  });

  it('does not classify ownership-transfer events as resource_transfer', () => {
    const targets = resolveNotificationTargets(
      event({
        payload: {
          recipientId: 'someone-else',
          requestId: 'rtr_1',
          toUserId: 'admin-1',
          transferId: 'tr_1',
        },
      }),
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]?.actionKind).toBe('workspace_ownership_transfer');
    expect(targets[0]?.actionRequestId).toBe('tr_1');
  });

  it('keeps agent/group resource transfers on the original action source', () => {
    const targets = resolveNotificationTargets(
      event({
        aggregateId: 'agent_1',
        aggregateType: 'agent',
        eventType: 'agent.transfer.requested',
        payload: { recipientId: 'u-2', requestId: 'rtr_9' },
      }),
    );

    expect(targets).toEqual([
      expect.objectContaining({
        actionKind: 'resource_transfer',
        actionRequestId: 'rtr_9',
        recipientUserId: 'u-2',
      }),
    ]);
  });
});

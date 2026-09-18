import type { NotificationFeedCard } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { versionedDecisionFromCard, visibleDecisionVerbs } from './inboxDecide';

const card = (overrides: Partial<NotificationFeedCard> = {}): NotificationFeedCard =>
  ({
    actionRef: {
      kind: 'acp_permission',
      requestId: 'apr_1',
      sourceRevision: 7,
    },
    activityVersion: 1,
    availableActions: ['archive', 'decide', 'open', 'snooze'],
    content: 'Approve this',
    decisionVerbs: ['approve', 'decline'],
    kind: 'action',
    lastActivityAt: '2026-09-18T00:00:00.000Z',
    notificationId: 'n1',
    read: false,
    readVersion: 0,
    title: 'Approval required',
    type: 'acp_permission',
    ...overrides,
  }) as NotificationFeedCard;

describe('visibleDecisionVerbs', () => {
  it('falls back to approve/decline when the card has decide but no verbs overlay', () => {
    expect(
      visibleDecisionVerbs(
        card({
          actionRef: { kind: 'acp_permission', requestId: 'apr_1' },
          decisionVerbs: [],
        }),
      ),
    ).toEqual(['approve', 'decline']);
  });

  it('keeps cancel-only verbs for an outgoing transfer overlay', () => {
    expect(visibleDecisionVerbs(card({ decisionVerbs: ['cancel'] }))).toEqual(['cancel']);
  });
});

describe('versionedDecisionFromCard', () => {
  it('sends the observed sourceRevision so a newer request cannot be approved', () => {
    expect(versionedDecisionFromCard(card(), 'approve', { idempotencyKey: 'idem-1' })).toEqual({
      actionRef: {
        kind: 'acp_permission',
        requestId: 'apr_1',
        sourceRevision: 7,
      },
      decision: 'approve',
      expectedSourceRevision: 7,
      idempotencyKey: 'idem-1',
    });
  });

  it('carries submit_input payload without dropping the revision', () => {
    expect(
      versionedDecisionFromCard(
        card({
          actionRef: { kind: 'acp_input', requestId: 'task_1', sourceRevision: 'task_1' },
        }),
        'submit_input',
        { idempotencyKey: 'idem-2', inputPayload: { answer: 'ship it' } },
      ),
    ).toMatchObject({
      decision: 'submit_input',
      expectedSourceRevision: 'task_1',
      inputPayload: { answer: 'ship it' },
    });
  });
});

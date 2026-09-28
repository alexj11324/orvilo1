import type { NotificationFeedCard } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearInboxDecisionOperation,
  decisionStillOpen,
  type InboxDecisionIdentity,
  inboxDecisionStorageKey,
  inboxInputDigest,
  loadInboxDecisionOperation,
  planInboxDecisionOperation,
  settleInboxDecisionOperation,
} from './inboxDecisionOps';

const identity = (overrides: Partial<InboxDecisionIdentity> = {}): InboxDecisionIdentity => ({
  decision: 'approve',
  executionGeneration: 2,
  inputDigest: 'digest-1',
  requestId: 'req_1',
  sourceRevision: 7,
  ...overrides,
});

const storageKey = inboxDecisionStorageKey({
  decision: 'approve',
  requestId: 'req_1',
  userId: 'u1',
  workspaceId: 'ws1',
});

const card = (overrides: Partial<NotificationFeedCard> = {}): NotificationFeedCard =>
  ({
    activityVersion: 1,
    availableActions: ['decide'],
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

beforeEach(() => {
  localStorage.clear();
});

describe('inboxInputDigest', () => {
  it('is order-independent for the same payload', () => {
    expect(inboxInputDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(
      inboxInputDigest({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('differs when the payload body differs', () => {
    expect(inboxInputDigest({ text: 'ship' })).not.toBe(inboxInputDigest({ text: 'hold' }));
    expect(inboxInputDigest()).not.toBe(inboxInputDigest({}));
  });
});

describe('planInboxDecisionOperation', () => {
  it('persists the operation so a retry after refresh reuses the same operationId', () => {
    const mint = vi.fn(() => 'op-1');
    const first = planInboxDecisionOperation(storageKey, identity(), mint);
    expect(first).toEqual({ needsReconcile: false, operationId: 'op-1', reused: false });

    // A second call reads the persisted record — same intent, same operation.
    const retry = planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-2'),
    );
    expect(retry.operationId).toBe('op-1');
    expect(retry.reused).toBe(true);
    expect(retry.needsReconcile).toBe(false);
  });

  it('mints a new operationId when the input body changed — different intent', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );

    const edited = planInboxDecisionOperation(
      storageKey,
      identity({ inputDigest: inboxInputDigest({ text: 'edited' }) }),
      vi.fn(() => 'op-2'),
    );

    expect(edited.operationId).toBe('op-2');
    expect(edited.reused).toBe(false);
    // The stale record is replaced, not resurrected.
    expect(
      loadInboxDecisionOperation(storageKey, identity({ inputDigest: 'digest-1' })),
    ).toBeNull();
  });

  it('mints a new operationId when the request generation or revision moved', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );

    const nextGeneration = planInboxDecisionOperation(
      storageKey,
      identity({ executionGeneration: 3 }),
      vi.fn(() => 'op-gen3'),
    );
    const nextRevision = planInboxDecisionOperation(
      storageKey,
      identity({ sourceRevision: 8 }),
      vi.fn(() => 'op-rev8'),
    );

    expect(nextGeneration.operationId).toBe('op-gen3');
    expect(nextRevision.operationId).toBe('op-rev8');
  });

  it('flags a persisted operation after outcome_unknown so the retry reconciles first', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );
    settleInboxDecisionOperation(storageKey, identity(), 'outcome_unknown');

    const retry = planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-2'),
    );

    expect(retry).toEqual({ needsReconcile: true, operationId: 'op-1', reused: true });
  });

  it('clears the operation on a terminal receipt — next send is a fresh intent', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );
    settleInboxDecisionOperation(storageKey, identity(), 'source_confirmed');

    const next = planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-2'),
    );
    expect(next.operationId).toBe('op-2');
  });

  it('clears the operation on stale/expired — the intent can never land', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );
    settleInboxDecisionOperation(storageKey, identity(), 'stale');

    expect(loadInboxDecisionOperation(storageKey, identity())).toBeNull();
  });

  it('clearInboxDecisionOperation forgets a stored operation', () => {
    planInboxDecisionOperation(
      storageKey,
      identity(),
      vi.fn(() => 'op-1'),
    );
    clearInboxDecisionOperation(storageKey);

    expect(loadInboxDecisionOperation(storageKey, identity())).toBeNull();
  });
});

describe('decisionStillOpen', () => {
  it('reports open while the verb is still offered', () => {
    expect(decisionStillOpen(card(), 'approve')).toBe('open');
  });

  it('reports alreadyResolved when the card no longer offers the verb', () => {
    expect(decisionStillOpen(card({ decisionVerbs: ['decline'] }), 'approve')).toBe(
      'alreadyResolved',
    );
    // An empty verb overlay on an actionable card falls back to approve/decline.
    expect(
      decisionStillOpen(
        card({
          actionRef: { kind: 'acp_permission', requestId: 'apr_1' },
          decisionVerbs: [],
        }),
        'approve',
      ),
    ).toBe('open');
  });

  it('reports gone when the card itself is missing or unreadable', () => {
    expect(decisionStillOpen(null, 'approve')).toBe('gone');
  });
});

import type { NotificationFeedCard } from '@orvilo/types';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearInboxDraft,
  inboxDraftKey,
  inboxDraftKeyForCard,
  readInboxDraft,
  writeInboxDraft,
} from './inboxDrafts';

const card = (overrides: Partial<NotificationFeedCard> = {}): NotificationFeedCard =>
  ({
    actionRef: {
      executionGeneration: 2,
      kind: 'acp_input',
      requestId: 'req_1',
      sourceRevision: 7,
    },
    activityVersion: 5,
    availableActions: ['decide'],
    content: 'Needs input',
    decisionVerbs: ['submit_input'],
    kind: 'action',
    lastActivityAt: '2026-09-18T00:00:00.000Z',
    notificationId: 'n1',
    read: false,
    readVersion: 0,
    title: 'Input required',
    type: 'acp_input',
    ...overrides,
  }) as NotificationFeedCard;

const scope = { userId: 'u1', workspaceId: 'ws1' };

beforeEach(() => {
  localStorage.clear();
});

describe('inboxDraftKey', () => {
  it('binds the draft to user + workspace + request + request generation', () => {
    const base = inboxDraftKey({ generation: 2, requestId: 'req_1', ...scope });

    expect(base).not.toBe(inboxDraftKey({ generation: 3, requestId: 'req_1', ...scope }));
    expect(base).not.toBe(inboxDraftKey({ generation: 2, requestId: 'req_2', ...scope }));
    expect(base).not.toBe(
      inboxDraftKey({ generation: 2, requestId: 'req_1', userId: 'u2', workspaceId: 'ws1' }),
    );
    expect(base).not.toBe(
      inboxDraftKey({ generation: 2, requestId: 'req_1', userId: 'u1', workspaceId: 'ws2' }),
    );
  });
});

describe('draft persistence', () => {
  it('survives a refresh — a fresh read returns the stored text', () => {
    const key = inboxDraftKeyForCard(card(), scope);
    expect(key).not.toBeNull();

    writeInboxDraft(key!, 'still typing this');

    expect(readInboxDraft(key!)).toBe('still typing this');
  });

  it('does not orphan the draft when the notification activityVersion bumps', () => {
    // The old bug keyed drafts by notification activityVersion — an ordinary
    // update made the input appear to vanish. The request generation is
    // stable across notification updates.
    const before = inboxDraftKeyForCard(card({ activityVersion: 5 }), scope);
    const after = inboxDraftKeyForCard(card({ activityVersion: 6 }), scope);

    expect(after).toBe(before);
  });

  it('never attaches a draft to a different generation of the request', () => {
    const keyGen2 = inboxDraftKeyForCard(card(), scope);
    const keyGen3 = inboxDraftKeyForCard(
      card({ actionRef: { executionGeneration: 3, kind: 'acp_input', requestId: 'req_1' } }),
      scope,
    );

    writeInboxDraft(keyGen2!, 'for generation 2');

    expect(readInboxDraft(keyGen3!)).toBe('');
  });

  it('keeps separate drafts for two pending requests', () => {
    const first = inboxDraftKeyForCard(card(), scope);
    const second = inboxDraftKeyForCard(
      card({ actionRef: { executionGeneration: 2, kind: 'acp_input', requestId: 'req_2' } }),
      scope,
    );

    writeInboxDraft(first!, 'answer for req_1');
    writeInboxDraft(second!, 'answer for req_2');

    expect(readInboxDraft(first!)).toBe('answer for req_1');
    expect(readInboxDraft(second!)).toBe('answer for req_2');
  });

  it('clear removes the stored draft entirely', () => {
    const key = inboxDraftKeyForCard(card(), scope);
    writeInboxDraft(key!, 'submitted');
    clearInboxDraft(key!);

    expect(readInboxDraft(key!)).toBe('');
    expect(localStorage.getItem(key!)).toBeNull();
  });

  it('returns null for an ordinary notification without a request', () => {
    expect(
      inboxDraftKeyForCard(card({ actionRef: undefined, decisionVerbs: [] }), scope),
    ).toBeNull();
  });
});

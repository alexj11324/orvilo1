import type { NotificationFeedCard } from '@orvilo/types';
import { useCallback, useState } from 'react';

import { inboxActionIdentity } from './inboxDecide';

/**
 * Persistent inbox reply drafts.
 *
 * A draft belongs to one real request — `user + workspace + request id +
 * request generation` — never to a notification row: an ordinary notification
 * update bumps `activityVersion` and must NOT make a typed reply vanish, and a
 * re-issued request (new execution generation) must never inherit the stale
 * draft. Storage is localStorage so the text survives refresh / restart, with
 * the same `orvilo:` key convention as `orvilo:task-create-draft:*`.
 *
 * Reusable by any surface that keeps a per-request text draft.
 */
const DRAFT_STORAGE_PREFIX = 'orvilo:inbox-draft';

export interface InboxDraftScope {
  /** `actionRef.executionGeneration ?? actionRef.sourceRevision ?? 0` — the request's own version, not the notification's. */
  generation: number | string;
  /** `actionRef.requestId` — the source request, stable across notification updates. */
  requestId: string;
  userId?: string;
  workspaceId: string | null;
}

export const inboxDraftKey = (scope: InboxDraftScope): string =>
  [
    DRAFT_STORAGE_PREFIX,
    scope.userId ?? 'anonymous',
    scope.workspaceId ?? 'personal',
    scope.requestId,
    String(scope.generation),
  ].join(':');

interface StoredInboxDraft {
  text: string;
  updatedAt: string;
}

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const readInboxDraft = (key: string): string => {
  const raw = storage()?.getItem(key);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as StoredInboxDraft;
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
};

/** Empty text removes the key — a cleared box must not resurrect a blank draft. */
export const writeInboxDraft = (key: string, text: string): void => {
  try {
    if (text.length === 0) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify({ text, updatedAt: new Date().toISOString() }));
  } catch {
    // Storage full / unavailable: the draft stays in memory, same as before.
  }
};

export const clearInboxDraft = (key: string): void => writeInboxDraft(key, '');

/**
 * Storage key for the draft bound to a card's request. `null` when the card
 * carries no actionable request — ordinary notifications have no draft.
 */
export const inboxDraftKeyForCard = (
  card: NotificationFeedCard,
  scope: { userId?: string; workspaceId: string | null },
): string | null => {
  const identity = inboxActionIdentity(card);
  if (!identity) return null;
  return inboxDraftKey({
    // Execution generation first; source revision covers sources that do not
    // version executions. Never the notification's activityVersion.
    generation: identity.executionGeneration ?? identity.sourceRevision ?? 0,
    requestId: identity.requestId,
    userId: scope.userId,
    workspaceId: scope.workspaceId,
  });
};

interface DraftState {
  key: string | null;
  value: string;
}

/**
 * Draft state hydrated from storage and written through on every change.
 * `clearKey` clears an arbitrary request's draft (e.g. after a submit lands)
 * without disturbing the draft the editor is currently showing.
 */
export const useInboxDraft = (
  draftKey: string | null,
): [string, (value: string) => void, (key: string) => void] => {
  const [state, setState] = useState<DraftState>(() => ({
    key: draftKey,
    value: draftKey ? readInboxDraft(draftKey) : '',
  }));

  // The same component instance serves consecutive selections without
  // remounting — rehydrate in render when the request scope changes instead
  // of leaking the previous request's text into it.
  if (state.key !== draftKey) {
    setState({ key: draftKey, value: draftKey ? readInboxDraft(draftKey) : '' });
  }

  const setDraft = useCallback((value: string) => {
    setState((previous) => {
      if (previous.key) writeInboxDraft(previous.key, value);
      return { ...previous, value };
    });
  }, []);

  const clearKey = useCallback((key: string) => {
    writeInboxDraft(key, '');
    setState((previous) => (previous.key === key ? { ...previous, value: '' } : previous));
  }, []);

  return [state.key === draftKey ? state.value : '', setDraft, clearKey];
};

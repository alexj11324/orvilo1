import type { DecisionVerb, NotificationFeedCard } from '@orvilo/types';

import { visibleDecisionVerbs } from './inboxDecide';

/**
 * Persisted decision-operation identity.
 *
 * One user intent — `request identity + source version + execution generation
 * + decision + input digest` — maps to exactly one `operationId`, stored in
 * localStorage so a refresh does not mint a second server operation. A retry
 * of the same intent reuses the operation; editing the input (new digest) or
 * a re-issued request (new generation/revision) is a *new* intent and mints a
 * new operationId. After an `outcome_unknown` result the record is kept and
 * flagged, so the next attempt reconciles the original operation before
 * resending — never a blind resend.
 *
 * Same `orvilo:` localStorage convention as `orvilo:task-create-draft:*`.
 */
const OPERATION_STORAGE_PREFIX = 'orvilo:inbox-decision';

export interface InboxDecisionScope {
  decision: DecisionVerb;
  requestId: string;
  userId?: string;
  workspaceId: string | null;
}

export const inboxDecisionStorageKey = (scope: InboxDecisionScope): string =>
  [
    OPERATION_STORAGE_PREFIX,
    scope.userId ?? 'anonymous',
    scope.workspaceId ?? 'personal',
    scope.requestId,
    scope.decision,
  ].join(':');

/** What the operation is bound to — any mismatch means a different intent. */
export interface InboxDecisionIdentity {
  decision: DecisionVerb;
  executionGeneration: number | null;
  inputDigest: string;
  requestId: string;
  sourceRevision: number | string | null;
}

export interface StoredInboxDecisionOperation extends InboxDecisionIdentity {
  /** Set when the last attempt returned `outcome_unknown` — the next send must reconcile first. */
  lastResult?: 'outcome_unknown';
  operationId: string;
  updatedAt: string;
}

/** Key-order-independent digest so the same payload always maps to one intent. */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
};

export const inboxInputDigest = (inputPayload?: Record<string, unknown>): string =>
  stableStringify(inputPayload ?? null);

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const saveInboxDecisionOperation = (
  storageKey: string,
  operation: StoredInboxDecisionOperation,
): void => {
  try {
    storage()?.setItem(
      storageKey,
      JSON.stringify({ ...operation, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable: the in-memory flow still works; persistence is best-effort only here.
  }
};

export const clearInboxDecisionOperation = (storageKey: string): void => {
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // ignore
  }
};

/**
 * The persisted operation counts only when every identity dimension matches —
 * a stale record under the same slot (edited input, new source revision, a
 * different request generation) is a dead intent and is dropped, so the next
 * send mints a fresh operationId instead of resurrecting the old one.
 */
export const loadInboxDecisionOperation = (
  storageKey: string,
  identity: InboxDecisionIdentity,
): StoredInboxDecisionOperation | null => {
  const raw = storage()?.getItem(storageKey);
  if (!raw) return null;
  let parsed: StoredInboxDecisionOperation;
  try {
    parsed = JSON.parse(raw) as StoredInboxDecisionOperation;
  } catch {
    clearInboxDecisionOperation(storageKey);
    return null;
  }
  const matches =
    typeof parsed.operationId === 'string' &&
    parsed.requestId === identity.requestId &&
    parsed.decision === identity.decision &&
    parsed.sourceRevision === identity.sourceRevision &&
    parsed.executionGeneration === identity.executionGeneration &&
    parsed.inputDigest === identity.inputDigest;
  if (!matches) {
    clearInboxDecisionOperation(storageKey);
    return null;
  }
  return parsed;
};

export interface InboxDecisionPlan {
  /** The previous attempt ended `outcome_unknown` — reconcile before resending. */
  needsReconcile: boolean;
  operationId: string;
  /** True when a persisted operation was reused — the intent is identical. */
  reused: boolean;
}

/**
 * Resolve the operationId for one decide call: identical intent reuses the
 * persisted operation; anything else mints and persists a new one.
 */
export const planInboxDecisionOperation = (
  storageKey: string,
  identity: InboxDecisionIdentity,
  mintOperationId: () => string = () => crypto.randomUUID(),
): InboxDecisionPlan => {
  const existing = loadInboxDecisionOperation(storageKey, identity);
  if (existing) {
    return {
      needsReconcile: existing.lastResult === 'outcome_unknown',
      operationId: existing.operationId,
      reused: true,
    };
  }
  const operationId = mintOperationId();
  saveInboxDecisionOperation(storageKey, { ...identity, operationId, updatedAt: '' });
  return { needsReconcile: false, operationId, reused: false };
};

/**
 * Record a settled attempt: terminal receipts close the operation;
 * `outcome_unknown` keeps it flagged so the retry reconciles first.
 */
export const settleInboxDecisionOperation = (
  storageKey: string,
  identity: InboxDecisionIdentity,
  status: string,
): void => {
  if (status === 'outcome_unknown') {
    const existing = loadInboxDecisionOperation(storageKey, identity);
    if (existing) {
      saveInboxDecisionOperation(storageKey, { ...existing, lastResult: 'outcome_unknown' });
    }
    return;
  }
  clearInboxDecisionOperation(storageKey);
};

/**
 * Whether the decision verb is still open on the freshest card — the reconcile
 * check an `outcome_unknown` retry runs before resending. A missing card means
 * the request can no longer be acted on from this scope.
 */
export const decisionStillOpen = (
  card: NotificationFeedCard | null,
  decision: DecisionVerb,
): 'alreadyResolved' | 'gone' | 'open' => {
  if (!card) return 'gone';
  return visibleDecisionVerbs(card).includes(decision) ? 'open' : 'alreadyResolved';
};

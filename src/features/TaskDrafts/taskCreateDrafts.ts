import { useSyncExternalStore } from 'react';

/**
 * Issue drafts — unsent new-issue composer state.
 *
 * Comment drafts live server-side (`task_comment_drafts`) because they attach
 * to a real task; an issue draft has no task yet, so it is kept client-side
 * under the same `orvilo:` localStorage convention as
 * `orvilo:task-create-draft:*` (inline entry) and `orvilo:inbox-draft:*`.
 * Storage is a per-workspace map of `{ [draftId]: TaskCreateDraft }` so any
 * number of drafts can accumulate — matching the reference Drafts page, which
 * lists each unfinished new-issue composer as its own card.
 */

const STORAGE_PREFIX = 'orvilo:task-create-drafts:v1';

const MAX_DRAFTS = 100;

export interface TaskCreateDraftFields {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  priority: number;
  projectId?: string;
  teamId?: string;
  title: string;
  visibility?: 'private' | 'public';
}

export interface TaskCreateDraft extends TaskCreateDraftFields {
  /** Markdown body — preview text + instruction fallback. */
  content: string;
  createdAt: number;
  /** `packDraftEditorData` envelope ({ version: 1, document, attachments }). */
  editorData?: unknown;
  hasAttachments: boolean;
  id: string;
  updatedAt: number;
}

export const createTaskCreateDraftId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export const taskCreateDraftsKey = (workspaceId: string | null | undefined): string =>
  `${STORAGE_PREFIX}:${workspaceId ?? 'personal'}`;

const storage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const isDraftEntry = (value: unknown): value is TaskCreateDraft =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as TaskCreateDraft).id === 'string' &&
  typeof (value as TaskCreateDraft).updatedAt === 'number' &&
  typeof (value as TaskCreateDraft).createdAt === 'number';

type DraftMap = Record<string, TaskCreateDraft>;

const readAll = (key: string): DraftMap => {
  const raw = storage()?.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const map: DraftMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isDraftEntry(value)) map[id] = value;
    }
    return map;
  } catch {
    return {};
  }
};

const writeAll = (key: string, map: DraftMap): boolean => {
  try {
    storage()?.setItem(key, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
};

const sortByUpdatedDesc = (map: DraftMap): TaskCreateDraft[] =>
  Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * Stable fingerprint over the persisted payload — timestamps and id excluded —
 * so a reopen + close without edits does not churn `updatedAt` and reorder the
 * drafts list. Nested `editorData` serializes identically for identical
 * documents, which is all the unchanged-check needs.
 */
const draftFingerprint = (draft: Omit<TaskCreateDraft, 'createdAt' | 'id' | 'updatedAt'>): string =>
  JSON.stringify({
    assigneeAgentId: draft.assigneeAgentId,
    assigneeUserId: draft.assigneeUserId,
    content: draft.content,
    editorData: draft.editorData,
    hasAttachments: draft.hasAttachments,
    priority: draft.priority,
    projectId: draft.projectId,
    teamId: draft.teamId,
    title: draft.title,
    visibility: draft.visibility,
  });

export const getTaskCreateDraft = (
  workspaceId: string | null | undefined,
  id: string,
): TaskCreateDraft | undefined => readAll(taskCreateDraftsKey(workspaceId))[id];

export const listTaskCreateDrafts = (workspaceId: string | null | undefined): TaskCreateDraft[] =>
  sortByUpdatedDesc(readAll(taskCreateDraftsKey(workspaceId)));

/**
 * Insert or update a draft. A write whose payload is identical to the stored
 * one is skipped entirely, preserving `updatedAt` ordering.
 */
export const saveTaskCreateDraft = (
  workspaceId: string | null | undefined,
  draft: Omit<TaskCreateDraft, 'createdAt' | 'updatedAt'> &
    Partial<Pick<TaskCreateDraft, 'createdAt' | 'updatedAt'>>,
): TaskCreateDraft | undefined => {
  const key = taskCreateDraftsKey(workspaceId);
  const map = readAll(key);
  const existing = map[draft.id];
  if (existing && draftFingerprint(existing) === draftFingerprint(draft)) return existing;

  const now = Date.now();
  const next: TaskCreateDraft = {
    ...draft,
    createdAt: existing?.createdAt ?? draft.createdAt ?? now,
    // Strictly increasing so two writes inside the same millisecond keep order.
    updatedAt: Math.max(now, (existing?.updatedAt ?? 0) + 1),
  };
  map[draft.id] = next;

  const ids = Object.keys(map);
  if (ids.length > MAX_DRAFTS) {
    ids
      .sort((a, b) => map[a].updatedAt - map[b].updatedAt)
      .slice(0, ids.length - MAX_DRAFTS)
      .forEach((staleId) => {
        delete map[staleId];
      });
  }

  if (!writeAll(key, map)) return undefined;
  notify(key);
  return next;
};

export const removeTaskCreateDraft = (workspaceId: string | null | undefined, id: string): void => {
  const key = taskCreateDraftsKey(workspaceId);
  const map = readAll(key);
  if (!(id in map)) return;
  delete map[id];
  writeAll(key, map);
  notify(key);
};

export const removeAllTaskCreateDrafts = (workspaceId: string | null | undefined): void => {
  const key = taskCreateDraftsKey(workspaceId);
  if (!storage()?.getItem(key)) return;
  try {
    storage()?.removeItem(key);
  } catch {
    return;
  }
  notify(key);
};

// --- Reactivity -------------------------------------------------------------
// Mirrors ChatInput/draftStorage.ts: localStorage is not reactive, so writes
// bump an in-memory snapshot that `useSyncExternalStore` subscribers read.
// `getSnapshot` caches by raw string identity, so unrelated renders never
// re-parse and writes from another tab are still picked up on next read.

const listeners = new Set<() => void>();
const rawCache = new Map<string, string | null>();
const listCache = new Map<string, TaskCreateDraft[]>();

const notify = (key: string) => {
  rawCache.delete(key);
  listCache.delete(key);
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshotList = (key: string): TaskCreateDraft[] => {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    // Storage unavailable — raw stays null.
  }
  if (rawCache.get(key) !== raw) {
    rawCache.set(key, raw);
    listCache.set(key, raw === null ? [] : sortByUpdatedDesc(readAll(key)));
  }
  return listCache.get(key) ?? [];
};

const EMPTY: TaskCreateDraft[] = [];

/**
 * Reactive list of the workspace's issue drafts, newest first. A cheap
 * localStorage read — safe to call for the sidebar badge as well as the page.
 */
export const useTaskCreateDrafts = (workspaceId: string | null | undefined): TaskCreateDraft[] =>
  useSyncExternalStore(
    subscribe,
    () =>
      typeof window === 'undefined' ? EMPTY : getSnapshotList(taskCreateDraftsKey(workspaceId)),
    () => EMPTY,
  );

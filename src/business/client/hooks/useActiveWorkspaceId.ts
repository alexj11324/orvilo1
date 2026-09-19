'use client';

import { useSyncExternalStore } from 'react';

export interface ActiveWorkspaceContext {
  id: string;
  slug: string;
}

/**
 * The active workspace selection lives in a module store, not the URL param —
 * the URL is the source of truth but readers run outside React
 * (`getActiveWorkspaceId` feeds SWR cache scoping and the `X-Workspace-Id`
 * tRPC header), so `useWorkspaceUrlSync` writes here once the slug has
 * resolved and every consumer subscribes to the result.
 */
let activeWorkspace: ActiveWorkspaceContext | null = null;

const listeners = new Set<() => void>();

export const subscribeActiveWorkspace = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setActiveWorkspaceContext = (next: ActiveWorkspaceContext | null) => {
  if (activeWorkspace?.id === next?.id && activeWorkspace?.slug === next?.slug) return;
  activeWorkspace = next;
  for (const listener of listeners) listener();
};

export const getActiveWorkspaceId = (): string | null => activeWorkspace?.id ?? null;

export const getActiveWorkspaceSlug = (): string | null => activeWorkspace?.slug ?? null;

export const useActiveWorkspaceId = (): string | null =>
  useSyncExternalStore(
    subscribeActiveWorkspace,
    () => activeWorkspace?.id ?? null,
    () => activeWorkspace?.id ?? null,
  );

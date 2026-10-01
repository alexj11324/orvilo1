'use client';

import { useParams } from 'react-router';

import { useFetchWorkspaces } from '@/business/client/hooks/useFetchWorkspaces';

export type WorkspaceSlugStatus =
  | { status: 'no-slug' }
  | { status: 'loading'; slug: string }
  | { status: 'not-found'; slug: string }
  | { status: 'ok'; workspaceId: string; slug: string };

/**
 * Reads the `:workspaceSlug` URL param and resolves it to a status used by
 * `WorkspaceSlugBoundary` for the 404 screen.
 *
 * Store synchronisation (URL → activeWorkspaceId) lives in
 * `useWorkspaceUrlSync`, which is mounted globally — this hook is purely
 * read-side.
 *
 * `data === undefined` — including a failed first fetch — keeps the slug
 * unresolved: a cold failure must not render as "resolved empty" (404) while
 * SWR retries. `not-found` is only honest once a real list response exists.
 */
export const useWorkspaceFromSlug = (): WorkspaceSlugStatus => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { data, isLoading } = useFetchWorkspaces();

  const matched = workspaceSlug
    ? ((data ?? []).find((w) => w.slug === workspaceSlug) ?? null)
    : null;

  if (!workspaceSlug) return { status: 'no-slug' };
  if (matched) return { status: 'ok', workspaceId: matched.id, slug: workspaceSlug };
  if (isLoading || data === undefined) return { status: 'loading', slug: workspaceSlug };
  return { status: 'not-found', slug: workspaceSlug };
};

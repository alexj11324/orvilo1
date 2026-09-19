'use client';

import { useLayoutEffect } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useIsWorkspaceLoading } from '@/business/client/hooks/useIsWorkspaceLoading';
import { useSilentSwitchWorkspace } from '@/business/client/hooks/useSwitchWorkspace';
import { useWorkspaces } from '@/business/client/hooks/useWorkspaces';

import { ensureDefaultWorkspace } from './ensureDefaultWorkspace';
import { useWorkspaceSyncPathname } from './useWorkspaceSyncPathname';

/**
 * Top-level route segments that share the namespace with `:workspaceSlug`.
 * Anything starting with one of these is NOT a workspace slug — even if the
 * first segment happens to resemble one.
 *
 * Kept in sync with `sharedMainAreaChildren` (paths) + the personal-only list
 * in router configs. If you add a new root path segment, add it here too —
 * `__tests__/reservedSegments.test.ts` now enforces exactly that, so the
 * instruction no longer depends on someone reading this comment. It found five
 * segments that had drifted out of the set (`agents`, `automations`, `goal`,
 * `inbox`, `project`); `/inbox` in particular was being treated as an
 * unresolved workspace slug, so the sync returned early and never switched the
 * store to personal the way it does for `/tasks`.
 */
export const RESERVED_FIRST_SEGMENTS = new Set([
  // Shared (mirrored under /:workspaceSlug too):
  'acceptance',
  'agent',
  'agents',
  'automations',
  'community',
  'goal',
  'group',
  'inbox',
  'members',
  'memory',
  'my-issues',
  'my-work',
  'page',
  'project',
  'projects',
  'resource',
  'reviews',
  'image',
  'video',
  'eval',
  'tasks',
  'task',
  'teams',
  'verify',
  'views',
  // Personal-only:
  'a',
  'apps',
  'settings',
  'onboarding',
  'me',
  'share',
  'devtools',
  'desktop-onboarding',
  'invite',
]);

const FIRST_SEGMENT_REGEX = /^\/([^/?#]+)/;

const parseFirstSegment = (pathname: string): string | null => {
  const match = pathname.match(FIRST_SEGMENT_REGEX);
  return match ? match[1] : null;
};

/** Last workspace the URL resolved to — the target for slug-less paths, which
 * Linear answers with "the workspace you were in last". */
const LAST_WORKSPACE_KEY = 'orvilo:last-active-workspace';

const readLastWorkspaceId = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
};

const writeLastWorkspaceId = (id: string) => {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, id);
  } catch {
    // Private-mode storage denial — the fallback is simply the first workspace.
  }
};

/**
 * Whether `pathname`'s first segment could be an (as-yet-unresolved) workspace
 * slug — i.e. it's present and not one of the reserved root segments.
 *
 * Top-level rendering only needs to block on the workspace list (to avoid a
 * false 404 / wrong-scope paint) when this is `true`. On personal / reserved
 * routes (`/`, `/agent/...`, `/settings/...`) the list isn't required to render,
 * so callers can show personal context immediately and let the list hydrate in
 * the background.
 */
export const isWorkspaceSlugCandidatePath = (pathname: string): boolean => {
  const first = parseFirstSegment(pathname);
  return !!first && !RESERVED_FIRST_SEGMENTS.has(first);
};

/**
 * URL is the source of truth for workspace context — and a workspace context
 * always exists (Linear's model: even a solo account lives in its own
 * workspace, so there is no personal scope).
 *
 * - `/{slug}/...` where `slug` is a known workspace → activate that workspace
 *   and remember it as the last-used target for slug-less paths
 * - `/` or `/agent/...` / `/settings/...` etc. → activate the last-used (or
 *   first) workspace; when the account has no workspace yet, provision a
 *   default one via `ensureDefault`
 * - `/{unknown}/...` (slug not in workspaces) → leave store alone so
 *   `WorkspaceSlugBoundary` can render its 404
 */
export const useWorkspaceUrlSync = (): void => {
  const pathname = useWorkspaceSyncPathname();
  const workspaces = useWorkspaces();
  const activeId = useActiveWorkspaceId();
  const isLoading = useIsWorkspaceLoading();
  // URL is a passive source, not an explicit user intent — use the silent
  // variant so refreshing or following a `/{slug}` link is not treated as
  // a user-driven switch.
  const { switchWorkspace } = useSilentSwitchWorkspace();

  // `useLayoutEffect` (not `useEffect`) so the workspace switch is scheduled
  // before the browser paints. With `useEffect` there is one paintable frame
  // between `isWorkspaceLoading: false` and `switchWorkspace()` running, which
  // causes downstream consumers (e.g. `WorkspaceContextSlot`) to briefly see
  // `isContextReady === true` and unhide stale children before the splash
  // re-asserts itself.
  useLayoutEffect(() => {
    // Defer until the workspace list has loaded so we don't briefly flip the
    // store to "personal" on first paint of a `/{slug}` URL.
    if (isLoading) return;

    const first = parseFirstSegment(pathname);

    if (first && !RESERVED_FIRST_SEGMENTS.has(first)) {
      const ws = workspaces.find((w) => w.slug === first);
      if (ws) {
        writeLastWorkspaceId(ws.id);
        if (activeId !== ws.id) void switchWorkspace(ws.id);
        return;
      }
      // Unknown slug — let `WorkspaceSlugBoundary` show 404; don't touch the
      // active workspace.
      return;
    }

    // Slug-less path. A workspace must still be in scope: when the account
    // hasn't been provisioned yet, create the default workspace and let the
    // revalidated list drive the next pass.
    if (workspaces.length === 0) {
      ensureDefaultWorkspace().catch(() => undefined);
      return;
    }

    const lastId = readLastWorkspaceId();
    const target = workspaces.find((w) => w.id === lastId) ?? workspaces[0];
    if (activeId !== target.id) void switchWorkspace(target.id);
  }, [pathname, workspaces, isLoading, activeId, switchWorkspace]);
};

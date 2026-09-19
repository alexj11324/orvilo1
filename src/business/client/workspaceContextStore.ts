import { create } from 'zustand';

/**
 * The single state source for workspace context in the OSS build.
 *
 * `null` means personal mode — no workspace scope. The URL is the source of
 * truth (`useWorkspaceUrlSync` reconciles this store against the first path
 * segment), so the selection is deliberately NOT persisted: a cold boot on
 * `/{slug}` reactivates through the sync, and a cold boot on `/` correctly
 * starts personal.
 *
 * Cloud overrides `src/business/*` wholesale, so this file ships together with
 * the hooks that read it — there is exactly one workspace store per build.
 */
export interface WorkspaceContextState {
  /** Active workspace id, or `null` in personal mode. */
  activeWorkspaceId: null | string;
  /**
   * Slug of the active workspace, denormalized so imperative callers
   * (workspace-aware navigation) can prefix paths synchronously without the
   * React tree or the SWR-cached workspace list.
   */
  activeWorkspaceSlug: null | string;
  setActiveWorkspace: (workspace: { id: string; slug: string } | null) => void;
}

export const useWorkspaceContextStore = create<WorkspaceContextState>()((set) => ({
  activeWorkspaceId: null,
  activeWorkspaceSlug: null,
  setActiveWorkspace: (workspace) =>
    set({
      activeWorkspaceId: workspace?.id ?? null,
      activeWorkspaceSlug: workspace?.slug ?? null,
    }),
}));

export const getWorkspaceContextState = (): WorkspaceContextState =>
  useWorkspaceContextStore.getState();

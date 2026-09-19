import { getWorkspaceContextState, useWorkspaceContextStore } from '../workspaceContextStore';

/**
 * Slug of the active workspace, kept alongside the id so
 * `buildWorkspaceAwarePath` can prefix `/{slug}` without a membership lookup.
 * `null` in personal mode.
 */
export const getActiveWorkspaceSlug = (): string | null =>
  getWorkspaceContextState().activeWorkspaceSlug;

export const useActiveWorkspaceSlug = (): string | null =>
  useWorkspaceContextStore((s) => s.activeWorkspaceSlug);

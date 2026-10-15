import { type UserStore } from '@/store/user';

const EMPTY_HIDDEN: string[] = [];
const EMPTY_VISIBILITY_OVERRIDES: Record<string, boolean> = {};

/** Explicit per-member workspace sidebar membership overrides. */
const sidebarAgentVisibilityOverrides = (s: UserStore): Record<string, boolean> =>
  s.workspaceUserPreference.sidebarAgentVisibilityOverrides ?? EMPTY_VISIBILITY_OVERRIDES;

/**
 * Sidebar items the caller removed from their sidebar in the active
 * workspace. Empty in personal mode (the preference bucket never loads
 * there — the personal counterpart lives in `users.preference`).
 */
const sidebarHiddenAgentIds = (s: UserStore): string[] =>
  s.workspaceUserPreference.sidebarHiddenAgentIds ?? EMPTY_HIDDEN;

/**
 * Folders (Categories) the caller hid from their sidebar in the active
 * workspace. The folders themselves stay shared — this is the personal mask.
 */
const sidebarHiddenGroupIds = (s: UserStore): string[] =>
  s.workspaceUserPreference.sidebarHiddenGroupIds ?? EMPTY_HIDDEN;

/** Whether the caller removed this item from their sidebar (default is listed). */
const isAgentHiddenFromSidebar =
  (agentId: string) =>
  (s: UserStore): boolean =>
    !!s.workspaceUserPreference.sidebarHiddenAgentIds?.includes(agentId);

/** Per-member sidebar sections layout for the active workspace. */
const sidebarLayout = (s: UserStore) => s.workspaceUserPreference.sidebar;

/** The workspace whose preference row is currently loaded (null = not yet fetched). */
const preferenceWorkspaceId = (s: UserStore) => s.workspaceUserPreferenceWorkspaceId;

export const workspaceUserSettingsSelectors = {
  isAgentHiddenFromSidebar,
  preferenceWorkspaceId,
  sidebarAgentVisibilityOverrides,
  sidebarHiddenAgentIds,
  sidebarHiddenGroupIds,
  sidebarLayout,
};

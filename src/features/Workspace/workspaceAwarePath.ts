import type { NavigateOptions } from 'react-router';

export interface WorkspaceAwareNavigateOptions extends NavigateOptions {
  /** When true, navigate to the literal `to` path without applying the workspace prefix. */
  escape?: boolean;
}

/**
 * Top-level path segments that are never mirrored under `/:workspaceSlug`.
 *
 * Kept in sync with `sharedMainAreaChildren` in the router configs. If you add
 * a new top-level personal-only route, append it here.
 *
 * `/settings` is handled separately via {@link WORKSPACE_SETTINGS_TABS} —
 * sub-paths in the allowlist get auto-prefixed; everything else (the index,
 * profile, provider, system-tools, etc.) stays personal.
 */
const PERSONAL_PATH_REGEX =
  /^\/(?:apps|invite|onboarding|me|share|devtools|desktop-onboarding)(?:[/?#]|$)/;

const isPersonalPath = (to: string): boolean => PERSONAL_PATH_REGEX.test(to);

/**
 * Settings sub-paths whose page lives at `/:workspaceSlug/settings/<tab>`.
 * Kept in sync with `sharedWorkspaceSettingsLeaves`.
 *
 * Only pages that read or write the workspace belong here. Account pages
 * (profile, appearance, hotkey, notification, …) are personal-only and never
 * prefixed; their retired workspace mirrors redirect to them.
 */
export const WORKSPACE_SETTINGS_TABS: ReadonlySet<string> = new Set([
  'billing',
  'budget',
  'credential',
  // Legacy alias for `credential` — the routers keep a redirect, so prefixed
  // deep-links still land on `/:slug/settings/credential`.
  'creds',
  'credits',
  'devices',
  'general',
  'imports',
  'integrations',
  'linear',
  'members',
  'plans',
  'statistics',
  // Legacy alias for `statistics` — the routers keep a redirect, so prefixed
  // deep-links still land on `/:slug/settings/statistics`.
  'stats',
  'usage',
]);

const SETTINGS_PREFIX_REGEX = /^\/settings\/([^/?#]+)/;
const SETTINGS_INDEX_REGEX = /^\/settings\/?(?:[?#]|$)/;
const FIRST_SEGMENT_REGEX = /^\/([^/?#]+)/;

export const WORKSPACE_MIRRORED_FIRST_SEGMENTS = new Set([
  'agent',
  'agents',
  'automations',
  'chat',
  'community',
  'drafts',
  'eval',
  'goal',
  'group',
  'image',
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
  'settings',
  'task',
  'tasks',
  'teams',
  'video',
  'views',
]);

const parseFirstSegment = (pathname: string): string | null => {
  const match = pathname.match(FIRST_SEGMENT_REGEX);
  return match ? match[1] : null;
};

/**
 * Returns `true` for the settings index and for `/settings/<tab>` where `<tab>`
 * is NOT in {@link WORKSPACE_SETTINGS_TABS} (profile, provider, system-tools, …).
 * The index is personal: `/settings` opens the account page, and the workspace
 * pages are reached by their own tab (`/settings/general`).
 */
const isPersonalSettingsPath = (to: string): boolean => {
  if (SETTINGS_INDEX_REGEX.test(to)) return true;
  const match = SETTINGS_PREFIX_REGEX.exec(to);
  if (!match) return false;
  return !WORKSPACE_SETTINGS_TABS.has(match[1]);
};

/**
 * Prefix an absolute path with `/${slug}` unless the path is already prefixed,
 * the path targets a personal-only surface, `escape` is set, or no active slug
 * exists. Returns the path unchanged when `to` is a relative path (so
 * `react-router` can resolve it itself).
 *
 * Pure function — extracted so it can be unit-tested without pulling in the
 * Zustand store / React tree.
 */
export const buildWorkspaceAwarePath = (
  to: string,
  activeSlug: string | null | undefined,
  options?: WorkspaceAwareNavigateOptions,
): string => {
  if (options?.escape) return to;
  if (!activeSlug) return to;
  if (!to.startsWith('/')) return to;
  if (isPersonalPath(to)) return to;
  if (isPersonalSettingsPath(to)) return to;
  if (to === `/${activeSlug}` || to.startsWith(`/${activeSlug}/`)) return to;

  const firstSegment = parseFirstSegment(to);
  if (firstSegment && !WORKSPACE_MIRRORED_FIRST_SEGMENTS.has(firstSegment)) return to;

  return `/${activeSlug}${to}`;
};

/**
 * Inverse of {@link buildWorkspaceAwarePath}: drops a leading `/${slug}` so
 * callers comparing the pathname against scope-relative destinations —
 * mobile tab-bar routes, the active-tab key — see the same path regardless
 * of which scope mirrored it. The strip is purely positional: only an exact
 * `/${slug}` or `/${slug}/…` prefix comes off; everything else passes
 * through unchanged.
 */
export const stripWorkspaceSlug = (
  pathname: string,
  activeSlug: string | null | undefined,
): string => {
  if (!activeSlug) return pathname;
  if (pathname === `/${activeSlug}`) return '/';
  if (pathname.startsWith(`/${activeSlug}/`)) return pathname.slice(activeSlug.length + 1);
  return pathname;
};

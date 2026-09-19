/**
 * Linear-converged primary IA — a fixed navigation contract, not a
 * user-sortable list. Persisted preferences may hide optional sections or
 * reorder favorites contents, but the core structure can never be reordered
 * and retired keys can never resurrect.
 *
 * Node ids are stable API: persisted `sidebarItems`, the customize modal,
 * platform nav mirrors and deep links all resolve through these keys, so
 * they never reuse an ambiguous legacy key ('project' meant both a route
 * and an accordion section).
 */
export const SIDEBAR_SCHEMA_VERSION = 2;

/** Top-level slots in canonical order. */
export const FIXED_PRIMARY_KEYS = [
  'inbox',
  'my-work',
  'reviews',
  'agent',
  'workspace',
  'favorites',
  'teams',
] as const;

/**
 * Legacy primary keys a stored preference must never surface at the top
 * level again. Retiring the sidebar key does NOT retire the route — /tasks,
 * /automations, /resource and /projects all stay reachable through Workspace
 * → More, Team pages, search and existing deep links.
 */
export const LEGACY_PRIMARY_KEYS = new Set([
  'home',
  'tasks',
  'automations',
  'resource',
  'recents',
  'private',
  'project',
  'views',
]);

/** Optional sections a user may hide — everything else is structural. */
export const OPTIONAL_SECTION_KEYS = new Set(['agent', 'workspace', 'favorites', 'teams']);

export const isFixedPrimaryKey = (key: string): key is (typeof FIXED_PRIMARY_KEYS)[number] =>
  (FIXED_PRIMARY_KEYS as readonly string[]).includes(key);

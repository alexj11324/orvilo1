import { type LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BrainCircuit,
  Download,
  FilePenIcon,
  FolderKanbanIcon,
  Image,
  LibraryBigIcon,
  ListTodoIcon,
  Settings,
  ShapesIcon,
  Video,
} from 'lucide-react';

/**
 * Where a route sits in the product's information architecture.
 *
 * - `primary`  — a top-level product entry. Always reachable, never hidden by
 *   persisted user preferences.
 * - `secondary` — still supported, but deliberately sunk below the primary
 *   working set. Reachable from a second-level surface, not the main nav.
 * - `retired`  — the product surface has been withdrawn. Retired routes are not
 *   offered by the sidebar, the sidebar customizer or the command palette. They
 *   stay in the registry on purpose: legacy deep links, persisted preferences
 *   and stored tab state still reference these ids, and `getRouteById` must keep
 *   resolving them to a safe target instead of throwing.
 *   See docs/development/product-scope.md.
 */
export type NavigationTier = 'primary' | 'retired' | 'secondary';

export interface NavigationRoute {
  /**
   * CMDK i18n key in common namespace.
   * Absent on retired routes — a withdrawn surface has no palette entry, so it
   * carries no palette wiring.
   */
  cmdkKey?: string;
  /** Route icon component */
  icon: LucideIcon;
  /** Unique route identifier */
  id: string;
  /** Keywords for CMDK search (fallback) */
  keywords?: string[];
  /** i18n key for CMDK keywords in common namespace */
  keywordsKey?: string;
  /** Route path */
  path: string;
  /** Path prefix for checking current location */
  pathPrefix: string;
  /**
   * Set on a retired entry whose stored URLs still land on live product —
   * the prefix is shared with a surviving surface or kept as an honest
   * redirect — so persisted references (Electron tabs, Recently Viewed) are
   * kept rather than purged. Absent means retiring the nav entry retires the
   * stored URLs too.
   */
  stillResolves?: boolean;
  /** Position in the product's information architecture */
  tier: NavigationTier;
  /** Whether route supports dynamic titles (for specific items) */
  useDynamicTitle?: boolean;
}

/**
 * Shared navigation route configuration
 * Used by both Electron navigation and CommandMenu (CMDK)
 */
export const NAVIGATION_ROUTES: NavigationRoute[] = [
  {
    icon: ShapesIcon,
    id: 'community',
    path: '/community',
    pathPrefix: '/community',
    tier: 'retired',
  },
  {
    icon: Video,
    id: 'video',
    path: '/video',
    pathPrefix: '/video',
    tier: 'retired',
  },
  {
    icon: Image,
    id: 'image',
    path: '/image',
    pathPrefix: '/image',
    tier: 'retired',
  },
  {
    cmdkKey: 'cmdk.resource',
    icon: LibraryBigIcon,
    id: 'resource',
    keywords: ['knowledge', 'files', 'library', 'documents'],
    keywordsKey: 'cmdk.keywords.resources',
    path: '/resource',
    pathPrefix: '/resource',
    tier: 'secondary',
  },
  {
    icon: FilePenIcon,
    id: 'page',
    path: '/page',
    pathPrefix: '/page',
    tier: 'retired',
    useDynamicTitle: true,
  },
  {
    icon: BrainCircuit,
    id: 'memory',
    path: '/memory',
    pathPrefix: '/memory',
    // The browsing center is gone but `/memory/preferences` still hosts the
    // manager users need to read, correct and delete stored memories.
    stillResolves: true,
    tier: 'retired',
  },
  {
    cmdkKey: 'cmdk.tasks',
    icon: ListTodoIcon,
    id: 'tasks',
    keywords: ['tasks', 'todo', 'agent', 'kanban', 'board'],
    keywordsKey: 'cmdk.keywords.tasks',
    path: '/tasks',
    pathPrefix: '/tasks',
    tier: 'primary',
  },
  {
    cmdkKey: 'cmdk.project',
    icon: FolderKanbanIcon,
    id: 'project',
    keywords: ['project', 'projects', 'workspace', 'board'],
    keywordsKey: 'cmdk.keywords.project',
    path: '/projects',
    pathPrefix: '/project',
    tier: 'primary',
  },
  {
    cmdkKey: 'cmdk.automations',
    icon: AlarmClock,
    id: 'automations',
    keywords: ['automation', 'schedule', 'cron', 'recurring', 'heartbeat'],
    keywordsKey: 'cmdk.keywords.automations',
    path: '/automations',
    pathPrefix: '/automations',
    tier: 'primary',
  },
  {
    icon: Download,
    id: 'apps',
    path: '/apps',
    pathPrefix: '/apps',
    // The promo page folded into Settings > About, which now hosts the
    // download links; `/apps` redirects there, so stored references still
    // land on the same capability.
    stillResolves: true,
    tier: 'retired',
  },
  {
    cmdkKey: 'cmdk.settings',
    icon: Settings,
    id: 'settings',
    keywords: ['settings', 'preferences', 'configuration', 'options'],
    keywordsKey: 'cmdk.keywords.settings',
    path: '/settings',
    pathPrefix: '/settings',
    tier: 'primary',
  },
];

/**
 * Path prefixes whose stored URLs no longer resolve to live product —
 * derived from the registry rather than listed again, so retiring a route
 * retires its stored URLs in the same edit.
 *
 * This is deliberately not every `retired`-tier entry: the tier says the
 * surface is unlisted, while a `stillResolves` flag says its URLs keep
 * landing somewhere honest (`/memory` hosts the surviving preferences
 * manager, `/apps` redirects to Settings > About). Only prefixes that are
 * dead ends belong here.
 *
 * Retirement has to reach persisted state, not only the surfaces that build
 * their entries from this registry. Electron keeps one tab list per scope in
 * `localStorage`, and a tab pinned before retirement would otherwise be
 * restored onto a path nothing resolves any more.
 */
export const DEAD_ROUTE_PREFIXES: Set<string> = new Set(
  NAVIGATION_ROUTES.filter((route) => route.tier === 'retired' && !route.stillResolves).map(
    (route) => route.pathPrefix,
  ),
);

/**
 * Every path prefix owned by a retired surface.
 *
 * A retired root path is a **reserved word**: it has to keep resolving to
 * something honest, and a dynamic segment must never claim it as an id. The
 * routers sit below the root paths they must not shadow, but a retired root
 * whose route was deleted along with the surface has nothing left to outrank
 * `/:workspaceSlug` — `/video` used to resolve as workspace `video` and answer
 * "no such workspace" instead of "this surface is gone". Both routers build one
 * guard per prefix here, so retiring a route reserves its root in the same
 * edit.
 */
export const RETIRED_ROUTE_PREFIXES: Set<string> = new Set(
  NAVIGATION_ROUTES.filter((route) => route.tier === 'retired').map((route) => route.pathPrefix),
);

/**
 * The retired roots the routers must guard explicitly, as bare path segments.
 *
 * Retired prefixes whose stored URLs still land on live product are excluded:
 * `/memory` hosts the surviving preferences manager and `/apps` redirects into
 * Settings > About, so both already own a route and a second one would shadow
 * it. The rest are the dead ends from {@link DEAD_ROUTE_PREFIXES}, which is why
 * this is derived from that set rather than listed again.
 */
export const RESERVED_RETIRED_ROOTS: readonly string[] = [...DEAD_ROUTE_PREFIXES].map((prefix) =>
  prefix.replace(/^\//, ''),
);

/**
 * Get route configuration by id
 */
export const getRouteById = (id: string): NavigationRoute | undefined =>
  NAVIGATION_ROUTES.find((r) => r.id === id);

/**
 * Routes the command palette offers under "Navigate".
 *
 * This is the single place that decides which destinations the palette can
 * reach: every non-retired route except `settings`, which MainMenu renders in
 * its own group so it can reuse that entry's icon and keyword handling.
 *
 * Retirement is expressed once, here, rather than as a per-surface hide: the
 * palette reads this list directly, and the sidebar and its customizer resolve
 * their entries through `getRouteById`.
 *
 * Surfaces that do not read the registry — the mobile tab bar, the Electron
 * native menus and tray — still have to be updated by hand, so they are where a
 * retired entry is most likely to survive unnoticed.
 *
 * `secondary` routes stay reachable on purpose: sinking a destination below
 * the primary working set is not the same as withdrawing it.
 */
export const getNavigableRoutes = (): NavigationRoute[] =>
  NAVIGATION_ROUTES.filter((r) => r.tier !== 'retired' && r.id !== 'settings');

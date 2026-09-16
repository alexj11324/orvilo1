import { type LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  BrainCircuit,
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
  /** CMDK i18n key in common namespace */
  cmdkKey: string;
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
    cmdkKey: 'cmdk.community',
    icon: ShapesIcon,
    id: 'community',
    keywords: ['discover', 'market', 'assistant', 'model', 'provider', 'mcp'],
    keywordsKey: 'cmdk.keywords.community',
    path: '/community',
    pathPrefix: '/community',
    tier: 'retired',
  },
  {
    cmdkKey: 'cmdk.video',
    icon: Video,
    id: 'video',
    keywords: ['video', 'generate', 'seedance', 'kling'],
    keywordsKey: 'cmdk.keywords.video',
    path: '/video',
    pathPrefix: '/video',
    tier: 'retired',
  },
  {
    cmdkKey: 'cmdk.painting',
    icon: Image,
    id: 'image',
    keywords: ['painting', 'art', 'generate', 'draw'],
    keywordsKey: 'cmdk.keywords.painting',
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
    cmdkKey: 'cmdk.pages',
    icon: FilePenIcon,
    id: 'page',
    keywords: ['documents', 'write', 'notes'],
    keywordsKey: 'cmdk.keywords.pages',
    path: '/page',
    pathPrefix: '/page',
    tier: 'retired',
    useDynamicTitle: true,
  },
  {
    cmdkKey: 'cmdk.memory',
    icon: BrainCircuit,
    id: 'memory',
    keywords: ['identities', 'contexts', 'preferences', 'experiences'],
    keywordsKey: 'cmdk.keywords.memory',
    path: '/memory',
    pathPrefix: '/memory',
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

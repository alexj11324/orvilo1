import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

export interface StaticRouteMeta {
  icon?: LucideIcon;
  /** Optional Electron tab label when it should differ from the document title. */
  tabTitleKey?: string;
  titleKey?: string;
}

export interface DynamicRouteMeta {
  avatar?: string;
  backgroundColor?: string;
  title?: string;
}

export type RouteMetaParams = Record<string, string | undefined>;

export interface DynamicRouteMetaProps {
  onResolve: (meta: DynamicRouteMeta) => void;
  params: RouteMetaParams;
}

export type RouteSkeletonChrome = 'page' | 'body';

export interface RouteSkeletonProps {
  chrome?: RouteSkeletonChrome;
}

export interface RouteMeta extends StaticRouteMeta {
  DynamicMeta?: ComponentType<DynamicRouteMetaProps>;
  /**
   * The matched route mounts a persistent portal column that renders
   * `PortalContent` — the task workspace does, through `TaskWorkspaceLayout`.
   *
   * Declared so the app-wide `AcceptancePortalDrawer` can tell whether this route
   * already has somewhere to show an acceptance view. Declared on the route rather
   * than matched against a list of paths because the same wrapper carries `/tasks`,
   * `/inbox`, `/task/*` and `/goal/*`, and the workspace mirror serves them all
   * again under `/:workspaceSlug`.
   *
   * A parent handle carrying only this is safe for titles: title and icon
   * resolution walk deepest-first, so leaf metas still win.
   */
  portalColumn?: true;
  Skeleton?: ComponentType<RouteSkeletonProps>;
}

export interface RouteHandle {
  meta?: RouteMeta;
}

export interface ResolvedRouteMeta {
  avatar?: string;
  backgroundColor?: string;
  icon?: LucideIcon;
  title: string;
}

/**
 * For a route whose surface is mounted outside the router outlet, or that
 * paints fast enough that any placeholder is pure flicker. Declared rather than
 * omitted: an absent `Skeleton` makes `RouteLoading` render nothing, so the
 * chunk wait is a blank pane.
 */
export const NoRouteSkeleton = () => null;

export const routeMeta = (meta: RouteMeta): RouteMeta => meta;

export const getRouteMetaFromHandle = (handle: unknown): RouteMeta | undefined => {
  if (!handle || typeof handle !== 'object') return undefined;
  return (handle as RouteHandle).meta;
};

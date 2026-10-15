import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { stripWorkspaceSlug } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { SidebarTabKey } from '@/store/global/initialState';

/**
 * Returns the active tab key (chat/market/settings/...)
 * React Router version for SPA
 */
export const useActiveTabKey = () => {
  const { pathname } = useActiveLocation();
  // Destinations are mirrored under `/{slug}` inside a workspace, so the raw
  // first segment is the slug there, not a tab key — strip it before reading.
  const scoped = stripWorkspaceSlug(pathname, useActiveWorkspaceSlug());
  return (scoped.split('/').find(Boolean)! as SidebarTabKey) || SidebarTabKey.Home;
};

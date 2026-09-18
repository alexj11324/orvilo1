'use client';

import { type PropsWithChildren } from 'react';

import { useIsWorkspaceLoading } from '@/business/client/hooks/useIsWorkspaceLoading';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import {
  isWorkspaceSlugCandidatePath,
  useWorkspaceUrlSync,
} from '@/features/Workspace/useWorkspaceUrlSync';
import { useWorkspaceSyncPathname } from '@/features/Workspace/useWorkspaceSyncPathname';

/**
 * Mounts workspace context for the whole subtree: keeps the active workspace
 * aligned with the URL (`useWorkspaceUrlSync`), and holds the `/{slug}` first
 * paint behind the membership list so a workspace route never renders one
 * frame of personal scope before the sync lands.
 *
 * Non-slug paths render immediately — personal surfaces don't owe the list a
 * blocking wait. `WorkspaceSlugBoundary` still owns the unknown-slug 404.
 */
export default function WorkspaceContextSlot({ children }: PropsWithChildren) {
  useWorkspaceUrlSync();
  const pathname = useWorkspaceSyncPathname();
  const isLoading = useIsWorkspaceLoading();

  if (isLoading && isWorkspaceSlugCandidatePath(pathname)) return <RouteLoading />;

  return children;
}

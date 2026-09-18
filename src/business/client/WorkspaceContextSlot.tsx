'use client';

import { Alert, Button } from '@lobehub/ui/base-ui';
import { type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { useInRouterContext } from 'react-router';

import { useFetchWorkspaces } from '@/business/client/hooks/useFetchWorkspaces';
import { useIsWorkspaceLoading } from '@/business/client/hooks/useIsWorkspaceLoading';
import { RouteLoading } from '@/components/Skeleton/RouteSegment';
import { useWorkspaceSyncPathname } from '@/features/Workspace/useWorkspaceSyncPathname';
import {
  isWorkspaceSlugCandidatePath,
  useWorkspaceUrlSync,
} from '@/features/Workspace/useWorkspaceUrlSync';

/**
 * The URL sync proper — mounted only inside a real `<Router>`. Tests and
 * embedders that render a bare subtree without routing still get a working
 * slot (children pass straight through) instead of a `useLocation` invariant.
 */
const RouterBoundWorkspaceSync = ({ children }: PropsWithChildren) => {
  useWorkspaceUrlSync();
  const pathname = useWorkspaceSyncPathname();
  const isLoading = useIsWorkspaceLoading();
  const { data, error, mutate } = useFetchWorkspaces();
  const { t } = useTranslation(['setting', 'common']);

  if (isWorkspaceSlugCandidatePath(pathname)) {
    // A terminal list failure is not "still loading" — surface it with a retry
    // instead of spinning forever or falling through to a false 404.
    if (error !== undefined && data === undefined) {
      return (
        <Alert
          message={t('workspace.loadFailedHint', { ns: 'setting' })}
          showIcon
          style={{ margin: 16 }}
          title={t('workspace.loadFailed', { ns: 'setting' })}
          type="error"
          extra={
            <Button onClick={() => void mutate()} size="small">
              {t('retry', { ns: 'common' })}
            </Button>
          }
        />
      );
    }
    if (isLoading) return <RouteLoading />;
  }

  return children;
};

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
  const inRouter = useInRouterContext();

  if (!inRouter) return children;

  return <RouterBoundWorkspaceSync>{children}</RouterBoundWorkspaceSync>;
}

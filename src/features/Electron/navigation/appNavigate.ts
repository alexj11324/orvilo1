import { getActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { stableWorkspaceAwareNavigate } from '@/features/Workspace/stableWorkspaceAwareNavigate';
import {
  buildWorkspaceAwarePath,
  type WorkspaceAwareNavigateOptions,
} from '@/features/Workspace/workspaceAwarePath';

export type AppNavigateTarget = 'activeTab' | 'newTab';

export interface AppNavigateOptions extends WorkspaceAwareNavigateOptions {
  target?: AppNavigateTarget;
}

export const appNavigate = (to: string, opts: AppNavigateOptions = {}): void => {
  const { target, ...rest } = opts;

  // Web has a single router and no app tab strip, so a new tab is a browser
  // tab on the same workspace-resolved route.
  if (target === 'newTab') {
    const resolved = buildWorkspaceAwarePath(to, getActiveWorkspaceSlug(), {
      escape: rest.escape,
    });
    window.open(resolved, '_blank', 'noopener,noreferrer');
    return;
  }

  stableWorkspaceAwareNavigate(to, rest);
};

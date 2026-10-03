import { useIsWorkspaceOwner } from '@/business/client/hooks/useIsWorkspaceOwner';
import { useIsWorkspaceViewer } from '@/business/client/hooks/useIsWorkspaceViewer';
import { usePermission } from '@/hooks/usePermission';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

export const useCanManageAutomation = (creatorId?: string | null) => {
  const { allowed } = usePermission('create_content');
  const isOwner = useIsWorkspaceOwner();
  const isViewer = useIsWorkspaceViewer();
  const userId = useUserStore(userProfileSelectors.userId);
  return allowed && !isViewer && (isOwner || (!!userId && creatorId === userId));
};

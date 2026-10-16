import { UsersIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import type { MenuProps } from '@/components/Menu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

export const useDropdownMenu = ({
  id,
  permissionManageable,
}: {
  id: string;
  permissionManageable?: boolean;
}) => {
  const { t } = useTranslation('setting');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();

  return useCallback(
    (): NonNullable<MenuProps['items']> =>
      workspaceId && permissionManageable
        ? [
            {
              icon: <UsersIcon size={14} />,
              key: 'member-permissions',
              label: t('permission.page.entry'),
              onClick: () => navigate(`/resource/library/${id}/permission`),
            },
          ]
        : [],
    [workspaceId, permissionManageable, id, navigate, t],
  );
};

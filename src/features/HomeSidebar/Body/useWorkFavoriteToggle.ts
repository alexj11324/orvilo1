import { toast } from '@lobehub/ui/base-ui';
import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

export const isWorkFavoritePinned = (
  items: Array<{ targetId: string; targetType: string }> | undefined,
  targetType: NavigationFavoriteTargetType,
  targetId: string | undefined,
) =>
  Boolean(
    targetId && items?.some((item) => item.targetType === targetType && item.targetId === targetId),
  );

export const useWorkFavoriteToggle = (
  targetType: NavigationFavoriteTargetType,
  targetId: string | undefined,
) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { data } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  const pinned = useMemo(
    () => isWorkFavoritePinned(data?.data, targetType, targetId),
    [data?.data, targetId, targetType],
  );

  const toggle = useCallback(async () => {
    if (!targetId) return;
    try {
      if (pinned) {
        await workAttentionService.favoriteUnpin({ targetId, targetType });
      } else {
        await workAttentionService.favoritePin({ targetId, targetType });
      }
      await mutate(workAttentionKeys.favorites(workspaceId));
    } catch {
      toast.error(t('savedViews.favoriteFailed'));
    }
  }, [pinned, t, targetId, targetType, workspaceId]);

  return { pinned, toggle };
};

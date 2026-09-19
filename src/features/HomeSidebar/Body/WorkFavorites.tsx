'use client';

import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  ActionIcon,
  toast,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { favoriteLabel } from './favoriteLabel';
import { favoriteReorderSwap } from './favoriteReorder';

interface WorkFavoritesProps {
  itemKey: string;
}

const targetPath = (targetType: string, targetId: string) => {
  if (targetType === 'task') return taskDetailPath(targetId);
  if (targetType === 'project') return `/project/${targetId}`;
  if (targetType === 'savedView') return `/views/${targetId}`;
  if (targetType === 'team') return `/teams/${targetId}`;
  return '/';
};

const WorkFavorites = memo<WorkFavoritesProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { data } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  const items = useMemo(() => data?.data ?? [], [data?.data]);

  const refresh = useCallback(
    () => mutate(workAttentionKeys.favorites(workspaceId)),
    [workspaceId],
  );

  const move = useCallback(
    async (index: number, direction: 'down' | 'up') => {
      const payload = favoriteReorderSwap(items, index, direction);
      if (!payload) return;
      try {
        await workAttentionService.favoriteReorder(payload);
      } catch (error) {
        if (!isTrpcErrorCode(error, 'CONFLICT')) {
          toast.error(t('favorites.reorderFailed'));
        }
      }
      await refresh();
    },
    [items, refresh, t],
  );

  if (items.length === 0) return null;

  return (
    <AccordionItem className={cx(accordionStyles.item)} value={itemKey}>
      <AccordionHeader>
        <AccordionTrigger>{t('tab.favorites')}</AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {items.map((item, index) => (
          <WorkspaceLink
            key={`${item.targetType}:${item.targetId}`}
            to={targetPath(item.targetType, item.targetId)}
          >
            <NavItem
              title={favoriteLabel(item.targetType, item.title, t, item.targetId)}
              extra={
                <>
                  <ActionIcon
                    disabled={index === 0}
                    icon={ChevronUp}
                    size="small"
                    title={t('navPanel.moveUp')}
                    onClick={() => void move(index, 'up')}
                  />
                  <ActionIcon
                    disabled={index === items.length - 1}
                    icon={ChevronDown}
                    size="small"
                    title={t('navPanel.moveDown')}
                    onClick={() => void move(index, 'down')}
                  />
                </>
              }
            />
          </WorkspaceLink>
        ))}
      </AccordionPanel>
    </AccordionItem>
  );
});

WorkFavorites.displayName = 'WorkFavorites';

export default WorkFavorites;

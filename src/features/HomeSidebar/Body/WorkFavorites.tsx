'use client';

import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

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
  const items = data?.data ?? [];
  if (items.length === 0) return null;

  return (
    <AccordionItem className={cx(accordionStyles.item)} value={itemKey}>
      <AccordionHeader>
        <AccordionTrigger>{t('tab.favorites')}</AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {items.map((item) => (
          <WorkspaceLink
            key={`${item.targetType}:${item.targetId}`}
            to={targetPath(item.targetType, item.targetId)}
          >
            <NavItem title={item.targetId} />
          </WorkspaceLink>
        ))}
      </AccordionPanel>
    </AccordionItem>
  );
});

WorkFavorites.displayName = 'WorkFavorites';

export default WorkFavorites;

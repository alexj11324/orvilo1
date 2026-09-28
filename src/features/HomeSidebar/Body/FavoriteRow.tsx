'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { ChevronDown, ChevronUp, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { FAVORITE_TARGET_ICONS } from './favoriteIcon';
import { favoriteLabel } from './favoriteLabel';
import { isFavoriteReorderDownDisabled, isFavoriteReorderUpDisabled } from './favoriteOverflow';
import { workTargetPath } from './workTargetPath';

interface FavoriteRowProps {
  index: number;
  item: NavigationFavorite;
  itemCount: number;
  onMove: (index: number, direction: 'down' | 'up') => void;
  onUnpin: (targetId: string, targetType: NavigationFavoriteTargetType) => void;
  showReorder?: boolean;
}

const FavoriteRow = ({
  index,
  item,
  itemCount,
  onMove,
  onUnpin,
  showReorder = true,
}: FavoriteRowProps) => {
  const { t } = useTranslation('common');

  return (
    <WorkspaceLink to={workTargetPath(item.targetType, item.targetId, item.title)}>
      <NavItem
        icon={FAVORITE_TARGET_ICONS[item.targetType]}
        title={favoriteLabel(item.targetType, item.title, t, item.targetId)}
        actions={
          <ActionIcon
            icon={PinOff}
            size="small"
            title={t('pinOff')}
            onClick={() => onUnpin(item.targetId, item.targetType)}
          />
        }
        extra={
          showReorder ? (
            <>
              <ActionIcon
                disabled={isFavoriteReorderUpDisabled(index)}
                icon={ChevronUp}
                size="small"
                title={t('navPanel.moveUp')}
                onClick={() => onMove(index, 'up')}
              />
              <ActionIcon
                disabled={isFavoriteReorderDownDisabled(index, itemCount)}
                icon={ChevronDown}
                size="small"
                title={t('navPanel.moveDown')}
                onClick={() => onMove(index, 'down')}
              />
            </>
          ) : undefined
        }
      />
    </WorkspaceLink>
  );
};

export default FavoriteRow;

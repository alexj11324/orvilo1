'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { GenericItemType } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { PinOff } from 'lucide-react';
import { type MouseEventHandler, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { FAVORITE_TARGET_ICONS } from './favoriteIcon';
import { favoriteLabel } from './favoriteLabel';
import { favoriteKey } from './favoriteReorder';
import { useFavoritePointerDragGuard } from './useFavoritePointerDragGuard';
import { workTargetPath } from './workTargetPath';

interface FavoriteRowProps {
  index: number;
  item: NavigationFavorite;
  itemCount: number;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  onMove: (index: number, direction: 'down' | 'up') => void;
  onUnpin: (targetId: string, targetType: NavigationFavoriteTargetType) => void;
  /** Reorder entries are meaningless while the drawer's search filters the list. */
  showReorder?: boolean;
}

const FavoriteRow = ({
  index,
  item,
  itemCount,
  onClick,
  onMove,
  onUnpin,
  showReorder = true,
}: FavoriteRowProps) => {
  const { t } = useTranslation('common');
  const unpinAction = (
    <ActionIcon
      icon={PinOff}
      size="small"
      title={t('pinOff')}
      onClick={() => onUnpin(item.targetId, item.targetType)}
    />
  );
  const reorderItems: GenericItemType[] = showReorder
    ? [
        {
          disabled: index === 0,
          key: 'move-up',
          label: t('navPanel.moveUp'),
          onClick: () => onMove(index, 'up'),
        },
        {
          disabled: index === itemCount - 1,
          key: 'move-down',
          label: t('navPanel.moveDown'),
          onClick: () => onMove(index, 'down'),
        },
        { type: 'divider' },
      ]
    : [];

  return (
    <WorkspaceLink
      draggable={false}
      to={workTargetPath(item.targetType, item.targetId, item.title)}
      onClick={onClick}
    >
      <NavItem
        actions={unpinAction}
        icon={FAVORITE_TARGET_ICONS[item.targetType]}
        title={favoriteLabel(item.targetType, item.title, t, item.targetId)}
        contextMenuItems={[
          ...reorderItems,
          {
            key: 'unpin',
            label: t('pinOff'),
            onClick: () => onUnpin(item.targetId, item.targetType),
          },
        ]}
      />
    </WorkspaceLink>
  );
};

interface SortableFavoriteRowProps extends FavoriteRowProps {
  /** Set for the whole gesture+drop task by the DndContext host; see the guard. */
  suppressClickRef?: RefObject<boolean>;
}

export const SortableFavoriteRow = ({ suppressClickRef, ...props }: SortableFavoriteRowProps) => {
  const dragGuard = useFavoritePointerDragGuard(suppressClickRef);
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: favoriteKey(props.item),
  });

  return (
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      role="listitem"
      style={{
        opacity: isDragging ? 0.5 : undefined,
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      onPointerDownCapture={dragGuard.onPointerDownCapture}
      onPointerMoveCapture={dragGuard.onPointerMoveCapture}
    >
      <FavoriteRow {...props} onClick={dragGuard.onClick} />
    </div>
  );
};

export default FavoriteRow;

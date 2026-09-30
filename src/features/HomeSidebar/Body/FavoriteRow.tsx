'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MenuProps } from '@lobehub/ui';
import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { ChevronDown, ChevronUp, MoreHorizontalIcon, PinOff } from 'lucide-react';
import { type MouseEventHandler, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarMenuAction } from '@/components/ui/sidebar';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarNavItem from '@/features/NavPanel/components/SidebarNavItem';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';

import { FAVORITE_TARGET_ICONS } from './favoriteIcon';
import { favoriteLabel } from './favoriteLabel';
import { isFavoriteReorderDownDisabled, isFavoriteReorderUpDisabled } from './favoriteOverflow';
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
  const menuItems: MenuProps['items'] = [
    {
      key: 'unpin',
      icon: <PinOff size={14} />,
      label: t('pinOff'),
      onClick: () => onUnpin(item.targetId, item.targetType),
    },
    ...(showReorder
      ? [
          {
            key: 'up',
            icon: <ChevronUp size={14} />,
            label: t('navPanel.moveUp'),
            disabled: isFavoriteReorderUpDisabled(index),
            onClick: () => onMove(index, 'up'),
          },
          {
            key: 'down',
            icon: <ChevronDown size={14} />,
            label: t('navPanel.moveDown'),
            disabled: isFavoriteReorderDownDisabled(index, itemCount),
            onClick: () => onMove(index, 'down'),
          },
        ]
      : []),
  ];

  return (
    <SidebarNavItem
      contextMenuItems={menuItems}
      icon={FAVORITE_TARGET_ICONS[item.targetType]}
      render={
        <WorkspaceLink
          draggable={false}
          to={workTargetPath(item.targetType, item.targetId, item.title)}
          onClick={onClick}
        />
      }
      title={favoriteLabel(item.targetType, item.title, t, item.targetId)}
      actions={
        <SidebarDropdownMenu items={menuItems}>
          <SidebarMenuAction showOnHover aria-label={t('navPanel.more')}>
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </SidebarDropdownMenu>
      }
    />
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

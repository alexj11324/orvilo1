'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { ChevronDown, ChevronUp, MoreHorizontalIcon, PinOff } from 'lucide-react';
import { type ComponentProps, type MouseEventHandler, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { SidebarMenuAction, type SidebarMenuItem } from '@/components/ui/sidebar';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
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
  /** Props for the row's li; the sortable wrapper passes its ref and listeners here. */
  itemProps?: ComponentProps<typeof SidebarMenuItem>;
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
  itemProps,
  onClick,
  onMove,
  onUnpin,
  showReorder = true,
}: FavoriteRowProps) => {
  const { t } = useTranslation('common');
  const menuItems: SidebarMenuItems = [
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
      itemProps={itemProps}
      title={favoriteLabel(item.targetType, item.title, t, item.targetId)}
      actions={
        <SidebarDropdownMenu items={menuItems}>
          <SidebarMenuAction showOnHover aria-label={t('navPanel.more')}>
            <MoreHorizontalIcon />
          </SidebarMenuAction>
        </SidebarDropdownMenu>
      }
      render={
        <WorkspaceLink
          draggable={false}
          to={workTargetPath(item.targetType, item.targetId, item.title)}
          onClick={onClick}
        />
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

  // The row's li is the sortable node, so the menu stays a valid ul > li list.
  // dnd-kit's role="button" is dropped for the same reason.
  const { role: _role, ...sortableAttributes } = attributes;

  return (
    <FavoriteRow
      {...props}
      itemProps={{
        ...sortableAttributes,
        ...listeners,
        ref: setNodeRef,
        style: {
          opacity: isDragging ? 0.5 : undefined,
          position: 'relative',
          transform: CSS.Transform.toString(transform),
          transition: transition ?? undefined,
          zIndex: isDragging ? 1 : undefined,
        },
        onPointerDownCapture: dragGuard.onPointerDownCapture,
        onPointerMoveCapture: dragGuard.onPointerMoveCapture,
      }}
      onClick={dragGuard.onClick}
    />
  );
};

export default FavoriteRow;

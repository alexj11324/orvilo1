'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { type MenuProps } from '@lobehub/ui';
import { DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  ActionIcon,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { Hash, LucideCheck, MoreHorizontalIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import AllFavoritesDrawer from './AllFavoritesDrawer';
import { hasMoreFavorites, visibleFavoriteRows } from './favoriteOverflow';
import { favoriteKey, favoriteReorderMove } from './favoriteReorder';
import FavoriteRow from './FavoriteRow';

interface WorkFavoritesProps {
  itemKey: string;
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;

// The click the browser synthesizes on the dropped row is dispatched to an
// inner node and follows the row anchor's native activation without ever
// reaching React's synthetic `onClick` — it can only be cancelled at native
// capture level. `once` bounds any leaked listener to a single swallowed click.
const cancelDropClick = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};
const WorkFavorites = memo<WorkFavoritesProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const favoritePageSize = useGlobalStore(systemStatusSelectors.favoritePageSize);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { data, error, isLoading, isValidating } = useClientDataSWR(
    workAttentionKeys.favorites(workspaceId),
    () => workAttentionService.favoriteList(),
  );
  // A settled response — even an empty list — survives later failed revalidations,
  // so rows keep rendering while the retry affordance stays visible.
  const hasSettled = data !== undefined;
  // Reorder writes the full ordered list, including team pins in personal mode.
  const items = useMemo(() => data?.data ?? [], [data?.data]);
  const itemKeys = useMemo(() => items.map(favoriteKey), [items]);
  const visibleItems = useMemo(
    () => visibleFavoriteRows(items, favoritePageSize),
    [favoritePageSize, items],
  );
  const visibleKeys = useMemo(() => visibleItems.map(favoriteKey), [visibleItems]);
  const hasMore = hasMoreFavorites(items.length, favoritePageSize);

  const refresh = useCallback(
    () => mutate(workAttentionKeys.favorites(workspaceId)),
    [workspaceId],
  );

  const move = useCallback(
    async (from: number, to: number) => {
      const payload = favoriteReorderMove(items, from, to);
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

  const moveByDirection = useCallback(
    (index: number, direction: 'down' | 'up') =>
      void move(index, index + (direction === 'up' ? -1 : 1)),
    [move],
  );

  // The browser fires a click on the dragged row's own anchor right after the
  // drop lands; suppress it for the rest of the gesture task so a reorder
  // never navigates. Clearing on the next macrotask keeps ordinary clicks.
  const suppressClickRef = useRef(false);
  const releaseClickSuppression = useCallback(() => {
    setTimeout(() => {
      suppressClickRef.current = false;
      document.removeEventListener('click', cancelDropClick, true);
    }, 0);
  }, []);
  const handleDragStart = useCallback(() => {
    suppressClickRef.current = true;
    document.addEventListener('click', cancelDropClick, { capture: true, once: true });
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over && active.id !== over.id) {
        void move(itemKeys.indexOf(String(active.id)), itemKeys.indexOf(String(over.id)));
      }
      releaseClickSuppression();
    },
    [itemKeys, move, releaseClickSuppression],
  );

  const unpin = useCallback(
    async (targetId: string, targetType: (typeof items)[number]['targetType']) => {
      try {
        await workAttentionService.favoriteUnpin({ targetId, targetType });
      } catch {
        toast.error(t('savedViews.favoriteFailed'));
      }
      await refresh();
    },
    [refresh, t],
  );

  const dropdownMenu = useMemo(() => {
    const pageSizeItems = PAGE_SIZE_OPTIONS.map((size) => ({
      icon: favoritePageSize === size ? <Icon icon={LucideCheck} /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ favoritePageSize: size });
      },
    }));

    return [
      {
        children: pageSizeItems,
        extra: favoritePageSize,
        icon: <Icon icon={Hash} />,
        key: 'show',
        label: t('navPanel.show'),
      },
    ] as MenuProps['items'];
  }, [favoritePageSize, t, updateSystemStatus]);

  // Linear keeps the Favorites section header mounted even when the workspace
  // has no pins — an empty panel is the correct shape, not a missing group.
  // Hiding the whole section is the user's call via Customize sidebar.
  return (
    <AccordionItem className={cx(accordionStyles.item)} value={itemKey}>
      <AccordionHeader>
        <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
          <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
            {t('tab.favorites')}
          </Text>
        </AccordionTrigger>
        <div
          className={cx(
            'accordion-action',
            accordionStyles.action,
            accordionStyles.actionBorderless,
          )}
        >
          <DropdownMenu items={dropdownMenu}>
            <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
          </DropdownMenu>
        </div>
      </AccordionHeader>
      <AccordionPanel>
        <Flexbox gap={1}>
          {isLoading && !hasSettled ? (
            <Flexbox aria-busy data-testid={'work-favorites-loading'}>
              <SkeletonList rows={2} />
            </Flexbox>
          ) : error && !hasSettled ? (
            <AsyncError error={error} retrying={isValidating} variant="inline" onRetry={refresh} />
          ) : (
            <>
              <DndContext
                collisionDetection={closestCenter}
                sensors={sensors}
                onDragCancel={releaseClickSuppression}
                onDragEnd={handleDragEnd}
                onDragStart={handleDragStart}
              >
                <SortableContext items={visibleKeys} strategy={verticalListSortingStrategy}>
                  <Flexbox gap={1} role="list">
                    {visibleItems.map((item, index) => (
                      <FavoriteRow
                        index={index}
                        item={item}
                        itemCount={items.length}
                        key={favoriteKey(item)}
                        onMove={moveByDirection}
                        onUnpin={(targetId, targetType) => void unpin(targetId, targetType)}
                        suppressClickRef={suppressClickRef}
                      />
                    ))}
                  </Flexbox>
                </SortableContext>
              </DndContext>
              {items.length === 0 && (
                <Text
                  fontSize={12}
                  style={{ paddingBlock: 4, paddingInline: 8 }}
                  type={'secondary'}
                >
                  {t('favorites.empty')}
                </Text>
              )}
              {error ? (
                <AsyncError
                  error={error}
                  retrying={isValidating}
                  title={t('favorites.refreshFailed')}
                  variant="inline"
                  onRetry={refresh}
                />
              ) : null}
              {hasMore && (
                <NavItem
                  icon={MoreHorizontalIcon}
                  title={t('more')}
                  onClick={() => setDrawerOpen(true)}
                />
              )}
            </>
          )}
          <AllFavoritesDrawer
            items={items}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onMove={moveByDirection}
            onUnpin={(targetId, targetType) => void unpin(targetId, targetType)}
          />
        </Flexbox>
      </AccordionPanel>
    </AccordionItem>
  );
});

WorkFavorites.displayName = 'WorkFavorites';

export default WorkFavorites;

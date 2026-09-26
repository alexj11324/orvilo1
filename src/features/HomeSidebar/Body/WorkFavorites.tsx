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
import { Flexbox } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { favoriteKey, favoriteReorderMove } from './favoriteReorder';
import FavoriteRow from './FavoriteRow';

interface WorkFavoritesProps {
  itemKey: string;
}

const WorkFavorites = memo<WorkFavoritesProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { data } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  // Reorder writes the full ordered list, including team pins in personal mode.
  const items = useMemo(() => data?.data ?? [], [data?.data]);
  const itemKeys = useMemo(() => items.map(favoriteKey), [items]);

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

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      void move(itemKeys.indexOf(String(active.id)), itemKeys.indexOf(String(over.id)));
    },
    [itemKeys, move],
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
      </AccordionHeader>
      <AccordionPanel>
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
            <Flexbox gap={1} role="list">
              {items.map((item, index) => (
                <FavoriteRow
                  index={index}
                  item={item}
                  itemCount={items.length}
                  key={favoriteKey(item)}
                  onUnpin={(targetId, targetType) => void unpin(targetId, targetType)}
                  onMove={(rowIndex, direction) =>
                    void move(rowIndex, rowIndex + (direction === 'up' ? -1 : 1))
                  }
                />
              ))}
            </Flexbox>
          </SortableContext>
        </DndContext>
      </AccordionPanel>
    </AccordionItem>
  );
});

WorkFavorites.displayName = 'WorkFavorites';

export default WorkFavorites;

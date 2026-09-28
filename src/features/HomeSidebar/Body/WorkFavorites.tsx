'use client';

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
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import NavItem from '@/features/NavPanel/components/NavItem';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import AllFavoritesDrawer from './AllFavoritesDrawer';
import { hasMoreFavorites, visibleFavoriteRows } from './favoriteOverflow';
import { favoriteReorderSwap } from './favoriteReorder';
import FavoriteRow from './FavoriteRow';

interface WorkFavoritesProps {
  itemKey: string;
}

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;

const WorkFavorites = memo<WorkFavoritesProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const favoritePageSize = useGlobalStore(systemStatusSelectors.favoritePageSize);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  // Keep team pins in personal mode too: favoriteReorder CAS rewrites the
  // full ordered list, so dropping hidden rows would persist an order without them.
  const items = useMemo(() => data?.data ?? [], [data?.data]);
  const visibleItems = useMemo(
    () => visibleFavoriteRows(items, favoritePageSize),
    [favoritePageSize, items],
  );
  const hasMore = hasMoreFavorites(items.length, favoritePageSize);

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
          {visibleItems.map((item, index) => (
            <FavoriteRow
              index={index}
              item={item}
              itemCount={items.length}
              key={`${item.targetType}:${item.targetId}`}
              onMove={(rowIndex, direction) => void move(rowIndex, direction)}
              onUnpin={(targetId, targetType) => void unpin(targetId, targetType)}
            />
          ))}
          {hasMore && (
            <NavItem
              icon={MoreHorizontalIcon}
              title={t('more')}
              onClick={() => setDrawerOpen(true)}
            />
          )}
          <AllFavoritesDrawer
            items={items}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onMove={(index, direction) => void move(index, direction)}
            onUnpin={(targetId, targetType) => void unpin(targetId, targetType)}
          />
        </Flexbox>
      </AccordionPanel>
    </AccordionItem>
  );
});

WorkFavorites.displayName = 'WorkFavorites';

export default WorkFavorites;

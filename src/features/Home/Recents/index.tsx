import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeOffIcon,
  Hash,
  LucideCheck,
  MoreHorizontalIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { memo, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { openCustomizeSidebarModal } from '@/features/HomeSidebar/Body/CustomizeSidebarModal';
import type { SidebarDropdownMenuProps } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SidebarDropdownMenu, {
  renderSidebarMenuItems,
} from '@/features/NavPanel/components/SidebarDropdownMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useCacheScope } from '@/libs/swr/useCacheScope';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { reorderSidebarItems } from '@/store/global/selectors/systemStatus';
import { useHomeStore } from '@/store/home';
import { homeRecentSelectors } from '@/store/home/selectors';
import { createRecentQueryKey } from '@/store/home/slices/recent/initialState';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import RecentsList from './List';

interface RecentsProps {
  itemKey: string;
}

const Recents = memo<RecentsProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const scope = useCacheScope();
  const isLogin = useUserStore(authSelectors.isLogin);
  const activeWorkspaceId = useActiveWorkspaceId();
  const recentPageSize = useGlobalStore(systemStatusSelectors.recentPageSize);
  const queryKey = createRecentQueryKey(recentPageSize + 1);
  const query = useHomeStore(homeRecentSelectors.query(scope, queryKey));
  const syncStatus = useHomeStore(homeRecentSelectors.syncStatus(scope, queryKey));
  const refreshRecents = useHomeStore((s) => s.refreshRecents);
  const sidebarItems = useGlobalStore(systemStatusSelectors.sidebarItems(activeWorkspaceId));
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const visibleItems = sidebarItems.filter((k) => !hiddenSections.includes(k));
  const visibleIndex = visibleItems.indexOf('recents');
  const isFirst = visibleIndex === 0;
  const isLast = visibleIndex === visibleItems.length - 1;

  const moveSection = useCallback(
    (direction: 'up' | 'down') => {
      const idx = sidebarItems.indexOf('recents');
      if (idx === -1) return;
      const next = reorderSidebarItems(sidebarItems, idx, direction === 'up' ? idx - 1 : idx + 1);
      if (next === sidebarItems) return;
      updateSystemStatus({ sidebarItems: next });
    },
    [sidebarItems, updateSystemStatus],
  );

  const hideSection = useCallback(() => {
    updateSystemStatus({ hiddenSidebarSections: [...hiddenSections, 'recents'] });
  }, [hiddenSections, updateSystemStatus]);

  const dropdownMenu = useMemo(() => {
    const pageSizeOptions = [5, 10, 15, 20];
    const pageSizeItems = pageSizeOptions.map((size) => ({
      icon: recentPageSize === size ? <LucideCheck /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ recentPageSize: size });
      },
    }));

    return [
      {
        children: pageSizeItems,
        extra: recentPageSize,
        icon: <Hash />,
        key: 'show',
        label: t('navPanel.show'),
      },
      {
        disabled: isFirst,
        icon: <ArrowUpIcon />,
        key: 'moveUp',
        label: t('navPanel.moveUp'),
        onClick: () => moveSection('up'),
      },
      {
        disabled: isLast,
        icon: <ArrowDownIcon />,
        key: 'moveDown',
        label: t('navPanel.moveDown'),
        onClick: () => moveSection('down'),
      },
      {
        disabled: false,
        icon: <EyeOffIcon />,
        key: 'hideSection',
        label: t('navPanel.hideSection'),
        onClick: hideSection,
      },
      { type: 'divider' as const },
      {
        icon: <SlidersHorizontalIcon />,
        key: 'customizeSidebar',
        label: t('navPanel.customizeSidebar'),
        onClick: () => openCustomizeSidebarModal(),
      },
    ] as SidebarDropdownMenuProps['items'];
  }, [recentPageSize, updateSystemStatus, t, isFirst, isLast, moveSection, hideSection]);

  if (!isLogin) return null;
  if (query && query.items.length === 0) return null;

  return (
    <AccordionItem value={itemKey}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
                <div className="flex items-center gap-1">
                  <div className="truncate text-[12px] text-muted-foreground font-medium">
                    {t('recents')}
                  </div>
                  {syncStatus?.isValidating && query && <NeuralNetworkLoading size={14} />}
                </div>
              </AccordionTrigger>
            </div>
            <div className="flex shrink-0 items-center">
              <SidebarDropdownMenu items={dropdownMenu}>
                <ActionIcon icon={MoreHorizontalIcon} size={'small'} style={{ flex: 'none' }} />
              </SidebarDropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>{renderSidebarMenuItems(dropdownMenu)}</ContextMenuContent>
      </ContextMenu>
      <AccordionContent>
        <Suspense fallback={<SkeletonList rows={3} />}>
          <RecentsList
            error={syncStatus?.error}
            scope={scope}
            onRetry={() => void refreshRecents(scope)}
          />
        </Suspense>
      </AccordionContent>
    </AccordionItem>
  );
});

export default Recents;

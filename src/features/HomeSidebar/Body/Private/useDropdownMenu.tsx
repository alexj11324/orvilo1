import { ArrowDownIcon, ArrowUpIcon, Hash, LucideCheck, SlidersHorizontalIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { openCustomizeSidebarModal } from '@/features/HomeSidebar/Body/CustomizeSidebarModal';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { reorderSidebarItems } from '@/store/global/selectors/systemStatus';

import { useCreateMenuItems } from '../../hooks';

interface PrivateActionsDropdownMenuProps {
  openConfigGroupModal: () => void;
}

export const usePrivateActionsDropdownMenu = ({
  openConfigGroupModal,
}: PrivateActionsDropdownMenuProps): SidebarMenuItems => {
  const { t } = useTranslation('common');

  const activeWorkspaceId = useActiveWorkspaceId();
  const privateAgentPageSize = useGlobalStore(systemStatusSelectors.privateAgentPageSize);
  const sidebarItems = useGlobalStore(systemStatusSelectors.sidebarItems(activeWorkspaceId));
  const hiddenSections = useGlobalStore(
    systemStatusSelectors.hiddenSidebarSections(activeWorkspaceId),
  );
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const visibleItems = sidebarItems.filter((k) => !hiddenSections.includes(k));
  const visibleIndex = visibleItems.indexOf('private');
  const isFirst = visibleIndex <= 0;
  const isLast = visibleIndex === visibleItems.length - 1;

  const moveSection = useCallback(
    (direction: 'up' | 'down') => {
      const idx = sidebarItems.indexOf('private');
      if (idx === -1) return;
      const next = reorderSidebarItems(sidebarItems, idx, direction === 'up' ? idx - 1 : idx + 1);
      if (next === sidebarItems) return;
      updateSystemStatus({ sidebarItems: next });
    },
    [sidebarItems, updateSystemStatus],
  );

  const { configMenuItem } = useCreateMenuItems();

  return useMemo(() => {
    const configItem = configMenuItem(openConfigGroupModal);

    const pageSizeOptions = [5, 10, 15, 20];
    const pageSizeItems = pageSizeOptions.map((size) => ({
      icon: privateAgentPageSize === size ? <LucideCheck size={16} /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ privateAgentPageSize: size });
      },
    }));

    return [
      configItem,
      { type: 'divider' as const },
      {
        children: pageSizeItems,
        extra: privateAgentPageSize,
        icon: <Hash size={16} />,
        key: 'show',
        label: t('navPanel.show'),
      },
      {
        disabled: isFirst,
        icon: <ArrowUpIcon size={16} />,
        key: 'moveUp',
        label: t('navPanel.moveUp'),
        onClick: () => moveSection('up'),
      },
      {
        disabled: isLast,
        icon: <ArrowDownIcon size={16} />,
        key: 'moveDown',
        label: t('navPanel.moveDown'),
        onClick: () => moveSection('down'),
      },
      { type: 'divider' as const },
      {
        icon: <SlidersHorizontalIcon size={16} />,
        key: 'customizeSidebar',
        label: t('navPanel.customizeSidebar'),
        onClick: () => openCustomizeSidebarModal(),
      },
    ].filter(Boolean) as SidebarMenuItems;
  }, [
    privateAgentPageSize,
    updateSystemStatus,
    configMenuItem,
    openConfigGroupModal,
    isFirst,
    isLast,
    moveSection,
    t,
  ]);
};

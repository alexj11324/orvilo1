import { Hash, LucideCheck, SlidersHorizontalIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { openCustomizeSidebarModal } from '@/features/HomeSidebar/Body/CustomizeSidebarModal';
import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useCreateMenuItems } from '../../hooks';

interface AgentActionsDropdownMenuProps {
  openConfigGroupModal: () => void;
}

export const useAgentActionsDropdownMenu = ({
  openConfigGroupModal,
}: AgentActionsDropdownMenuProps): SidebarMenuItems => {
  const { t } = useTranslation('common');

  const agentPageSize = useGlobalStore(systemStatusSelectors.agentPageSize);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  // Create menu items
  const { configMenuItem } = useCreateMenuItems();

  return useMemo(() => {
    const configItem = configMenuItem(openConfigGroupModal);

    const pageSizeOptions = [5, 10, 15, 20];
    const pageSizeItems = pageSizeOptions.map((size) => ({
      icon: agentPageSize === size ? <LucideCheck size={16} /> : <div />,
      key: `pageSize-${size}`,
      label: t('pageSizeItem', { count: size }),
      onClick: () => {
        updateSystemStatus({ agentPageSize: size });
      },
    }));

    return [
      configItem,
      { type: 'divider' as const },
      {
        children: pageSizeItems,
        extra: agentPageSize,
        icon: <Hash size={16} />,
        key: 'show',
        label: t('navPanel.show'),
      },
      { type: 'divider' as const },
      {
        icon: <SlidersHorizontalIcon size={16} />,
        key: 'customizeSidebar',
        label: t('navPanel.customizeSidebar'),
        onClick: () => openCustomizeSidebarModal(),
      },
    ].filter(Boolean) as SidebarMenuItems;
  }, [agentPageSize, updateSystemStatus, configMenuItem, openConfigGroupModal, t]);
};

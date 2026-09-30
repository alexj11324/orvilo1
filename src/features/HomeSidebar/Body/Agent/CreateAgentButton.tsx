'use client';

import { cx } from 'antd-style';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Button } from '@/components/ui/button';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { usePermission } from '@/hooks/usePermission';
import { SessionDefaultGroup } from '@/types/session';

import { useCreateMenuItems } from '../../hooks';

interface CreateAgentButtonProps {
  className?: string;
  groupId?: string;
  visibility?: 'private' | 'public';
}

const CreateAgentButton = memo<CreateAgentButtonProps>(({ groupId, className, visibility }) => {
  const { t } = useTranslation('chat');
  const { allowed: canCreate, reason } = usePermission('create_content');
  const {
    createAgent,
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createGroupChatMenuItem,
    isMutatingAgent,
    openCreateModal,
  } = useCreateMenuItems();

  const isCustomGroup = Boolean(groupId) && groupId !== SessionDefaultGroup.Default;
  // Always carry visibility so agents created inside a private session group
  // land in the private bucket (otherwise they default to public and end up
  // orphaned — invisible in both lists). groupId is only attached for custom
  // groups so the default list keeps creating top-level agents.
  const menuOptions = useMemo(
    () =>
      isCustomGroup || visibility
        ? { ...(isCustomGroup ? { groupId } : {}), ...(visibility ? { visibility } : {}) }
        : undefined,
    [groupId, isCustomGroup, visibility],
  );

  const dropdownItems = useMemo(() => {
    const connectItem = createConnectAgentMenuItem(menuOptions);
    // The list entry stays available for the private bucket too; the bucket
    // decides which tab the agent-list page opens on.
    const showDiscoveryItems = !isCustomGroup;
    return [
      createAgentMenuItem(menuOptions),
      createGroupChatMenuItem(menuOptions),
      ...(connectItem ? [{ type: 'divider' as const }, connectItem] : []),
      ...(showDiscoveryItems
        ? [
            { type: 'divider' as const },
            createAgentListMenuItem(visibility ? { visibility } : undefined),
          ]
        : []),
    ];
  }, [
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createGroupChatMenuItem,
    isCustomGroup,
    menuOptions,
    visibility,
  ]);

  const handleClick = () => {
    if (!canCreate) return;
    if (openCreateModal) {
      openCreateModal('agent', menuOptions);
    } else {
      createAgent(menuOptions);
    }
  };

  return (
    <div
      className={cx('group/create-agent flex items-center gap-1', className)}
      title={!canCreate ? reason : undefined}
    >
      <Button
        className="min-w-0 flex-1 justify-start"
        disabled={!canCreate || isMutatingAgent}
        variant="ghost"
        onClick={handleClick}
      >
        {isMutatingAgent ? <NeuralNetworkLoading size={14} /> : <PlusIcon />}
        <span className="truncate">{t('addAgent')}</span>
      </Button>
      {canCreate && (
        <SidebarDropdownMenu items={dropdownItems}>
          <Button
            aria-label={t('addAgent')}
            className="opacity-0 transition-opacity group-hover/create-agent:opacity-100 data-[popup-open]:opacity-100"
            size="icon"
            variant="ghost"
          >
            <ChevronDownIcon />
          </Button>
        </SidebarDropdownMenu>
      )}
    </div>
  );
});

export default CreateAgentButton;

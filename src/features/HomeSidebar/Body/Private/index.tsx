'use client';

import { ArrowRight } from 'lucide-react';
import React, { memo, type MouseEvent, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';

import { useCreateMenuItems } from '../../hooks';
import Actions from '../Agent/Actions';
import { useAgentModal } from '../Agent/ModalProvider';
import PrivateList from './List';
import { usePrivateActionsDropdownMenu } from './useDropdownMenu';

interface PrivateProps {
  itemKey: string;
}

// Top-level "Private" sidebar section, structurally mirroring the Agent
// accordion. Everything created from the `+` button is hard-pinned to
// `visibility: 'private'`, so users get a predictable bucket for personal
// work without ever having to think about visibility flags.
//
// Sidebar-level controls (manage groups, move up/down, customize sidebar)
// live in the "More" dropdown so private management stays consistent with
// the workspace-public Agent section.
const Private = memo<PrivateProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const { isRevalidating } = useFetchAgentList();

  const { openConfigGroupModal } = useAgentModal();

  const {
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createGroupChatMenuItem,
    isLoading,
  } = useCreateMenuItems();

  // Mirror the public Agent "+" menu so the create surface is consistent
  // across both buckets — heterogeneous and platform agents are hard-pinned
  // to private here. Session-group creation lives in the "More" dropdown.
  const addMenuItems = useMemo(() => {
    const connectItem = createConnectAgentMenuItem({ visibility: 'private' });

    return [
      createAgentMenuItem({ visibility: 'private' }),
      createGroupChatMenuItem({ visibility: 'private' }),
      ...(connectItem ? [{ type: 'divider' as const }, connectItem] : []),
      // Same discovery entries as the workspace-public section — the agent
      // list opens on the Private tab so the surface matches this bucket.
      { type: 'divider' as const },
      createAgentListMenuItem({ visibility: 'private' }),
    ];
  }, [
    createAgentListMenuItem,
    createAgentMenuItem,
    createConnectAgentMenuItem,
    createGroupChatMenuItem,
  ]);

  const handleOpenConfigGroupModal = useCallback(() => {
    openConfigGroupModal('private');
  }, [openConfigGroupModal]);

  const dropdownMenu = usePrivateActionsDropdownMenu({
    openConfigGroupModal: handleOpenConfigGroupModal,
  });

  const navigate = useWorkspaceAwareNavigate();
  const handleViewAll = useCallback(
    (e: MouseEvent) => {
      // Stop the click from toggling the accordion header.
      e.stopPropagation();
      // Land the view-all page on the tab matching this section.
      navigate('/agents?tab=private');
    },
    [navigate],
  );

  return (
    <AccordionItem value={itemKey}>
      <SidebarContextMenu items={dropdownMenu}>
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <AccordionTrigger>
              <div className="flex items-center gap-[4px]">
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {t('navPanel.privateAgents', { defaultValue: 'Private' })}
                </span>
                {isRevalidating && <NeuralNetworkLoading size={14} />}
              </div>
            </AccordionTrigger>
          </div>
          <div className="flex shrink-0 items-center">
            <Button
              aria-label={t('navPanel.viewAllAgents')}
              size="icon"
              title={t('navPanel.viewAllAgents')}
              variant="ghost"
              onClick={handleViewAll}
            >
              <ArrowRight />
            </Button>
            <Actions
              addMenuItems={addMenuItems}
              dropdownMenu={dropdownMenu}
              isLoading={isLoading}
            />
          </div>
        </div>
      </SidebarContextMenu>
      <AccordionContent>
        <Suspense fallback={<SkeletonList rows={3} />}>
          <PrivateList />
        </Suspense>
      </AccordionContent>
    </AccordionItem>
  );
});

Private.displayName = 'Private';

export default Private;

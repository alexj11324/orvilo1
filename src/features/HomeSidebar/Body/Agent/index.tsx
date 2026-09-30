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
import { useFetchAgentLabels } from '@/hooks/useFetchAgentLabels';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';

import { useCreateMenuItems } from '../../hooks';
import Actions from './Actions';
import List from './List';
import { useAgentModal } from './ModalProvider';
import { useAgentActionsDropdownMenu } from './useDropdownMenu';

interface AgentProps {
  itemKey: string;
}

const Agent = memo<AgentProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const { isRevalidating } = useFetchAgentList();
  // Keep the label registry warm so the per-item "Labels" submenu opens populated.
  useFetchAgentLabels();
  const titleKey = 'navPanel.agent';

  const { openConfigGroupModal } = useAgentModal();

  // Create menu items
  const { createTopLevelMenuItems, isLoading } = useCreateMenuItems();

  const addMenuItems = useMemo(() => createTopLevelMenuItems(), [createTopLevelMenuItems]);

  const handleOpenConfigGroupModal = useCallback(() => {
    openConfigGroupModal();
  }, [openConfigGroupModal]);

  const dropdownMenu = useAgentActionsDropdownMenu({
    openConfigGroupModal: handleOpenConfigGroupModal,
  });

  const navigate = useWorkspaceAwareNavigate();
  const handleViewAll = useCallback(
    (e: MouseEvent) => {
      // Stop the click from toggling the accordion header.
      e.stopPropagation();
      navigate('/agents');
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
                  {t(titleKey)}
                </span>
                {isRevalidating && <NeuralNetworkLoading size={14} />}
              </div>
            </AccordionTrigger>
          </div>
          <div className="flex shrink-0 items-center">
            {/* The flat view-all page adapts per mode: workspace gets the
                workspace/private segments + per-user pin + author column;
                personal mode gets the plain flat list. */}
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
        <Suspense fallback={<SkeletonList rows={6} />}>
          <div className="flex flex-col gap-[1px] py-[1px]">
            <List />
          </div>
        </Suspense>
      </AccordionContent>
    </AccordionItem>
  );
});

export default Agent;

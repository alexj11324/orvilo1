'use client';

import { ArrowRight } from 'lucide-react';
import React, { memo, type MouseEvent, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';

import Actions from '../Agent/Actions';
import { useAgentModal } from '../Agent/ModalProvider';
import PrivateList from './List';
import { usePrivateActionsDropdownMenu } from './useDropdownMenu';

interface PrivateProps {
  itemKey: string;
}

// Private Agent navigation; creation belongs to the Agents page.
const Private = memo<PrivateProps>(({ itemKey }) => {
  const { t } = useTranslation('common');
  const { isRevalidating } = useFetchAgentList();

  const { openConfigGroupModal } = useAgentModal();

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
            <Actions dropdownMenu={dropdownMenu} />
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

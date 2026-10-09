'use client';

import { ArrowUpDown, Loader2Icon, UserPlus } from 'lucide-react';
import { type MouseEvent } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { useInitGroupConfig } from '@/hooks/useInitGroupConfig';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import GroupMember from '../GroupConfig/GroupMember';
import SortMembersModal from '../GroupConfig/SortMembersModal';

interface MembersProps {
  itemKey: string;
}

const Members = memo<MembersProps>(({ itemKey }) => {
  const { t } = useTranslation('chat');
  const { allowed: hasEditPermission, reason } = usePermission('edit_own_content');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [sortModalOpen, setSortModalOpen] = useState(false);

  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const { canEditResource } = useResourceAccess('agentGroup', activeGroupId);
  const canEdit = hasEditPermission && canEditResource;
  const membersCount = useAgentGroupStore(
    agentGroupSelectors.getGroupAgentCount(activeGroupId || ''),
  );
  const { isRevalidating } = useInitGroupConfig();

  const handleAddMember = (e: MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;

    setAddModalOpen(true);
  };

  const handleSortMember = (e: MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;

    setSortModalOpen(true);
  };

  return (
    <AccordionItem value={itemKey}>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
            <div className="truncate text-[12px] text-muted-foreground font-medium">
              {`${t('groupSidebar.tabs.members')} ${membersCount}`}
            </div>
          </AccordionTrigger>
        </div>
        <div className="flex shrink-0 items-center">
          <div className="flex items-center gap-1">
            {isRevalidating && <ActionIcon loading icon={Loader2Icon} size={'small'} />}
            {membersCount > 1 && (
              <ActionIcon
                disabled={!canEdit}
                icon={ArrowUpDown}
                size={'small'}
                title={canEdit ? t('groupSidebar.members.sortMember') : reason}
                onClick={handleSortMember}
              />
            )}
            <ActionIcon
              disabled={!canEdit}
              icon={UserPlus}
              size={'small'}
              title={canEdit ? t('groupSidebar.members.addMember') : reason}
              onClick={handleAddMember}
            />
          </div>
        </div>
      </div>
      <AccordionContent className="p-0">
        <div className="flex flex-col" style={{ gap: 1, paddingBlock: 1 }}>
          <GroupMember
            addModalOpen={addModalOpen}
            groupId={activeGroupId}
            onAddModalOpenChange={setAddModalOpen}
          />
        </div>
        {activeGroupId && (
          <SortMembersModal
            groupId={activeGroupId}
            open={sortModalOpen}
            onCancel={() => setSortModalOpen(false)}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
});

export default Members;

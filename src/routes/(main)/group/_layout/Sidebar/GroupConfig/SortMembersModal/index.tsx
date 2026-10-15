'use client';

import { agentDisplayName, type AgentGroupMember } from '@orvilo/types';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Sortable, SortableItem } from '@/components/reui/sortable';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import MemberItem from './MemberItem';

const styles = {
  item: 'min-h-10 px-2 rounded-(--radius-card) text-sm leading-5.5 transition-[background-color] duration-(--orvilo-motion-mid) ease-in-out hover:bg-accent motion-reduce:transition-none',
};

interface SortMembersModalProps {
  groupId: string;
  onCancel: () => void;
  open: boolean;
}

/**
 * Drag-to-reorder the group's member roster. Persists on drop via
 * `reorderGroupMembers`, mirroring the session-group sort flow (ConfigGroupModal).
 */
const SortMembersModal = memo<SortMembersModalProps>(({ groupId, open, onCancel }) => {
  const { t } = useTranslation('chat');
  const { allowed: canEdit } = usePermission('edit_own_content');

  const members = useAgentGroupStore(agentGroupSelectors.getGroupAgents(groupId), isEqual);
  const reorderGroupMembers = useAgentGroupStore((s) => s.reorderGroupMembers);

  // Local (optimistic) order so the list doesn't snap back while the reorder
  // request + refetch are in flight. Re-seed from the persisted roster each time
  // the modal opens.
  const [list, setList] = useState<AgentGroupMember[]>(members);
  useEffect(() => {
    if (open) setList(members);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ImperativeModal
      footer={null}
      open={open}
      title={t('groupSidebar.members.sortModalTitle')}
      width={400}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-0.5">
        <Sortable
          className="flex flex-col gap-0.5"
          getItemValue={(item: AgentGroupMember) => item.id}
          value={list}
          onValueChange={setList}
          onValueCommit={(next: AgentGroupMember[]) => {
            if (!canEdit) return;

            setList(next);
            reorderGroupMembers(
              groupId,
              next.map((member) => member.id),
            );
          }}
        >
          {list.map((item: AgentGroupMember) => (
            <SortableItem
              className={cn(styles.item, 'flex items-center gap-2')}
              key={item.id}
              value={item.id}
            >
              <MemberItem
                disabled={!canEdit}
                isCoordinator={item.isSupervisor}
                runtimeType={item.heterogeneousType}
                title={agentDisplayName(item, t('defaultSession', { ns: 'common' }))}
              />
            </SortableItem>
          ))}
        </Sortable>
      </div>
    </ImperativeModal>
  );
});

export default SortMembersModal;

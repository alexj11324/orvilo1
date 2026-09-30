'use client';

import { type AgentGroupMember } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ImperativeModal from '@/components/ImperativeModal';
import { Sortable, SortableItem } from '@/components/reui/sortable';
import { usePermission } from '@/hooks/usePermission';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import MemberItem from './MemberItem';

const styles = createStaticStyles(({ css, cssVar }) => ({
  item: css`
    height: 40px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};
    transition: background 0.2s ease-in-out;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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

  const members = useAgentGroupStore(agentGroupSelectors.getGroupMembers(groupId), isEqual);
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
          onValueChange={(next: AgentGroupMember[]) => setList(next)}
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
              className={cx(styles.item, 'flex items-center gap-2')}
              key={item.id}
              value={item.id}
            >
              <MemberItem
                avatar={item.avatar || undefined}
                background={item.backgroundColor ?? undefined}
                disabled={!canEdit}
                isExternal={!item.virtual}
                title={item.title || t('defaultSession', { ns: 'common' })}
              />
            </SortableItem>
          ))}
        </Sortable>
      </div>
    </ImperativeModal>
  );
});

export default SortMembersModal;

'use client';

import { agentDisplayName } from '@orvilo/types';
import { UserMinus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AgentProfilePopup from '@/features/AgentProfileCard/AgentProfilePopup';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import UserAvatar from '@/features/User/UserAvatar';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { usePermission } from '@/hooks/usePermission';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import AddGroupMemberModal from '../AddGroupMemberModal';
import GroupMemberItem from './GroupMemberItem';

const styles = {
  memberTrigger:
    'rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) motion-reduce:transition-none data-[popup-open]:bg-accent data-[active=true]:bg-selected data-[active=true]:data-[popup-open]:bg-selected',
};

interface GroupMemberProps {
  addModalOpen: boolean;
  groupId?: string;
  onAddModalOpenChange: (open: boolean) => void;
}

/**
 * Group member info in Sidebar
 */
const GroupMember = memo<GroupMemberProps>(({ addModalOpen, onAddModalOpenChange, groupId }) => {
  const { t } = useTranslation('chat');
  const { allowed: hasEditPermission, reason } = usePermission('edit_own_content');
  const { canEditResource } = useResourceAccess('agentGroup', groupId);
  const canEdit = hasEditPermission && canEditResource;
  const router = useQueryRoute();
  const location = useActiveLocation();
  const [nickname, username] = useUserStore((s) => [
    userProfileSelectors.nickName(s),
    userProfileSelectors.username(s),
  ]);
  const addAgentsToGroup = useAgentGroupStore((s) => s.addAgentsToGroup);
  const removeAgentFromGroup = useAgentGroupStore((s) => s.removeAgentFromGroup);

  const groupMembers = useAgentGroupStore(agentGroupSelectors.getGroupAgents(groupId || ''));

  const activeTab = useMemo(
    () => new URLSearchParams(location.search).get('tab'),
    [location.search],
  );
  const isProfileRoute = useMemo(() => {
    if (!groupId) return false;
    return location.pathname === `/group/${groupId}/profile`;
  }, [groupId, location.pathname]);

  const handleAddMembers = async (selectedAgents: string[]) => {
    if (!canEdit) return;
    if (!groupId) {
      console.error('No active group to add members to');
      return;
    }

    if (selectedAgents.length > 0) {
      await addAgentsToGroup(groupId, selectedAgents);
    }

    onAddModalOpenChange(false);
  };

  const [removingMemberIds, setRemovingMemberIds] = useState<string[]>([]);

  const withRemovingFlag = async (id: string, task: () => Promise<void>) => {
    setRemovingMemberIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await task();
    } finally {
      setRemovingMemberIds((prev) => prev.filter((memberId) => memberId !== id));
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!canEdit) return;
    if (!groupId) return;

    await withRemovingFlag(memberId, () => removeAgentFromGroup(groupId, memberId));
  };

  const handleMemberDoubleClick = (agentId: string) => {
    if (!groupId || !canEdit) return;
    router.push(`/group/${groupId}/profile`, { query: { tab: agentId }, replace: true });
  };

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {/* User */}
        <NavItem icon={<UserAvatar size={24} />} title={nickname || username || 'User'} />
        {groupId &&
          groupMembers.map((item) => (
            <AgentProfilePopup agent={item} agentId={item.id} groupId={groupId} key={item.id}>
              <div
                className={styles.memberTrigger}
                data-active={isProfileRoute && activeTab === item.id ? 'true' : undefined}
                onDoubleClick={() => handleMemberDoubleClick(item.id)}
              >
                <GroupMemberItem
                  isCoordinator={item.isSupervisor}
                  runtimeType={item.heterogeneousType}
                  title={agentDisplayName(item, t('defaultSession', { ns: 'common' }))}
                  actions={
                    <ActionIcon
                      danger
                      disabled={!canEdit}
                      icon={UserMinus}
                      loading={removingMemberIds.includes(item.id)}
                      size={{ blockSize: 24, borderRadius: 'var(--radius-button)', size: 16 }}
                      title={canEdit ? t('groupSidebar.members.removeMember') : reason}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMember(item.id);
                      }}
                    />
                  }
                />
              </div>
            </AgentProfilePopup>
          ))}
      </div>

      {groupId && (
        <AddGroupMemberModal
          existingMembers={groupMembers.map((member) => member.id)}
          groupId={groupId}
          open={addModalOpen}
          onCancel={() => onAddModalOpenChange(false)}
          onConfirm={handleAddMembers}
        />
      )}
    </>
  );
});

export default GroupMember;

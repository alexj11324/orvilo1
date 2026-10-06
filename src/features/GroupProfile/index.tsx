'use client';

import { canRunGroupSupervisorRuntime } from '@orvilo/heterogeneous-agents';
import { agentDisplayName } from '@orvilo/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncError from '@/components/AsyncError';
import { confirmModal } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
import ProfileSkeleton from '@/components/Skeleton/Profile';
import { Button } from '@/components/ui/button';
import ResourceConfigAccessGate from '@/features/ResourcePermission/ResourceConfigAccessGate';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import AddGroupMemberModal from '@/routes/(main)/group/_layout/Sidebar/AddGroupMemberModal';
import BasicSettings from '@/routes/(main)/group/profile/features/GroupProfile';
import StoreSync from '@/routes/(main)/group/profile/StoreSync';
import { chatGroupService } from '@/services/chatGroup';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

const GroupSettings = ({ groupId }: { groupId: string }) => {
  const { t } = useTranslation(['chat', 'common']);
  const navigate = useWorkspaceAwareNavigate();
  const group = useAgentGroupStore((state) => agentGroupSelectors.getGroupById(groupId)(state));
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const members = group?.agents ?? [];
  const changeCoordinator = async (agentId: string) => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      await chatGroupService.updateAgentInGroup(groupId, agentId, { role: 'supervisor' });
      await useAgentGroupStore.getState().refreshGroupDetail(groupId);
    } catch (cause) {
      console.error('Failed to select Group coordinator:', cause);
      setError(cause);
    } finally {
      setPending(false);
    }
  };

  if (!group) return <ProfileSkeleton variant="group" />;

  return (
    <div className="h-full flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{group.title}</h1>
          <Button variant="outline" onClick={() => navigate(`/group/${groupId}`)}>
            {t('group.settings.back')}
          </Button>
        </div>
        <BasicSettings />
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">{t('group.create.participants')}</h2>
            <Button disabled={pending} size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              {t('group.settings.addMembers')}
            </Button>
          </div>
          {!group.supervisorAgentId && (
            <p className="text-sm text-muted-foreground" role="status">
              {t('group.settings.chooseCoordinator')}
            </p>
          )}
          {!members.length && (
            <p className="text-sm text-muted-foreground">{t('group.create.noParticipants')}</p>
          )}
          {members.map((member) => (
            <div className="flex items-center gap-3 rounded-lg border p-3" key={member.id}>
              <AgentRuntimeIcon size={24} type={member.heterogeneousType} />
              <Button
                className="min-w-0 justify-start"
                variant="ghost"
                onClick={() => navigate(`/agent/${member.id}`)}
              >
                <span className="truncate">
                  {agentDisplayName(member, t('defaultSession', { ns: 'common' }))}
                </span>
              </Button>
              {member.isSupervisor && (
                <Badge variant="secondary">{t('group.settings.coordinatorName')}</Badge>
              )}
              <div className="ml-auto flex shrink-0 gap-2">
                {!member.isSupervisor && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      pending || !canRunGroupSupervisorRuntime({ type: member.heterogeneousType })
                    }
                    title={
                      !canRunGroupSupervisorRuntime({ type: member.heterogeneousType })
                        ? t('group.settings.coordinatorUnavailable')
                        : undefined
                    }
                    onClick={() => void changeCoordinator(member.id)}
                  >
                    {t('group.settings.setCoordinator')}
                  </Button>
                )}
                <Button
                  disabled={pending}
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirmModal({
                      content: t(
                        member.virtual
                          ? 'group.settings.deleteOwnedDescription'
                          : 'group.settings.removeSharedDescription',
                      ),
                      title: t(
                        member.virtual
                          ? 'group.settings.deleteOwned'
                          : 'group.settings.removeShared',
                      ),
                      okButtonProps: { danger: !!member.virtual },
                      onOk: async () => {
                        await useAgentGroupStore
                          .getState()
                          .removeAgentFromGroup(groupId, member.id);
                      },
                    })
                  }
                >
                  {t(member.virtual ? 'group.settings.deleteOwned' : 'group.settings.removeShared')}
                </Button>
              </div>
            </div>
          ))}
          {!!error && <AsyncError error={error} variant="inline" />}
          <AddGroupMemberModal
            existingMembers={members.map((member) => member.id)}
            groupId={groupId}
            open={addOpen}
            onCancel={() => setAddOpen(false)}
            onConfirm={async (ids) => {
              await useAgentGroupStore.getState().addAgentsToGroup(groupId, ids);
              setAddOpen(false);
            }}
          />
        </section>
      </div>
    </div>
  );
};

export const GroupProfile = () => {
  const { gid } = useParams<{ gid: string }>();
  return (
    <ResourceConfigAccessGate
      loading={<ProfileSkeleton variant="group" />}
      redirectPath={`/group/${gid ?? ''}`}
      resourceId={gid}
      resourceType="agentGroup"
    >
      <StoreSync />
      {gid && <GroupSettings groupId={gid} key={gid} />}
    </ResourceConfigAccessGate>
  );
};

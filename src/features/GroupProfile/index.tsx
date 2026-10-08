'use client';

import { canRunGroupSupervisorRuntime } from '@orvilo/heterogeneous-agents';
import { agentDisplayName } from '@orvilo/types';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import { confirmModal } from '@/components/Modal';
import ProfileSkeleton from '@/components/Skeleton/Profile';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { AgentRuntimeConfig } from '@/features/CreateAgent';
import ConfiguredOrchestratorSelector from '@/features/Orchestrator/ConfiguredOrchestratorSelector';
import { copyOrchestratorWorkingDirectory } from '@/features/Orchestrator/copyWorkingDirectory';
import ResourceConfigAccessGate from '@/features/ResourcePermission/ResourceConfigAccessGate';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import AddGroupMemberModal from '@/routes/(main)/group/_layout/Sidebar/AddGroupMemberModal';
import BasicSettings from '@/routes/(main)/group/profile/features/GroupProfile';
import MemberProfile from '@/routes/(main)/group/profile/features/MemberProfile';
import StoreSync from '@/routes/(main)/group/profile/StoreSync';
import { agentService } from '@/services/agent';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useGroupProfileStore } from '@/store/groupProfile';

import { CoordinatorSummary } from './CoordinatorSummary';
import { isCoordinatorDirty, isOpeningDirty } from './groupSettingsDirty';
import { useGroupSettingsDraft } from './useGroupSettingsDraft';

const GroupSettings = ({ groupId }: { groupId: string }) => {
  const { t } = useTranslation(['chat', 'common', 'setting']);
  const navigate = useWorkspaceAwareNavigate();
  const group = useAgentGroupStore((state) => agentGroupSelectors.getGroupById(groupId)(state));
  const [tab, setTab] = useState('basic');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [orchestratorId, setOrchestratorId] = useState<string>();
  const pendingWorkingDirectorySource = useRef<string | undefined>(undefined);
  const [orchestratorReady, setOrchestratorReady] = useState<boolean>();
  const coordinator = group?.agents.find((agent) => agent.isSupervisor);
  const selectedOrchestratorId = orchestratorId ?? coordinator?.params?.orchestratorSourceAgentId;
  const { runtime, setRuntime, prompt, setPrompt, opening, setOpening, questions, setQuestions } =
    useGroupSettingsDraft(
      coordinator,
      group?.config?.openingMessage,
      group?.config?.openingQuestions,
    );
  const validCoordinator =
    !!runtime &&
    (!selectedOrchestratorId || orchestratorReady === true) &&
    canRunGroupSupervisorRuntime(runtime.agencyConfig?.heterogeneousProvider) &&
    (runtime.agencyConfig?.heterogeneousProvider?.type !== 'orvilo' || !!runtime.model);
  const selectOrchestrator = useCallback(
    (agentId: string, config: AgentRuntimeConfig, explicit = false) => {
      setOrchestratorReady(true);
      if (!explicit && agentId === coordinator?.params?.orchestratorSourceAgentId) return;
      setOrchestratorId(agentId);
      if (explicit) pendingWorkingDirectorySource.current = agentId;
      setRuntime(config);
    },
    [setRuntime, coordinator?.params?.orchestratorSourceAgentId],
  );
  const invalidateOrchestrator = useCallback(() => setOrchestratorReady(false), []);
  const members = group?.agents.filter((agent) => !agent.isSupervisor) ?? [];

  const coordinatorDirty = isCoordinatorDirty({
    coordinator,
    prompt,
    runtime,
    selectedOrchestratorId,
  });
  const openingDirty = isOpeningDirty({
    opening,
    openingMessage: group?.config?.openingMessage,
    openingQuestions: group?.config?.openingQuestions,
    questions,
  });
  // Both drafts live in this component, so Save persists every tab with edits,
  // not only the visible one: otherwise edits on a tab you left would stay
  // unsaved behind a "saved" toast.
  const saveCoordinator = tab === 'coordinator' || coordinatorDirty;
  const saveOpening = tab === 'opening' || openingDirty;

  const save = async () => {
    if (!group || pending) return;
    if (saveCoordinator && !validCoordinator) {
      // On the coordinator tab the button is already disabled; from another tab
      // say why the pending coordinator edits block the save.
      if (tab !== 'coordinator') setError(new Error(t('group.settings.coordinatorIncomplete')));
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      if (saveCoordinator && coordinator && runtime && validCoordinator) {
        await agentService.updateAgentConfig(
          coordinator.id,
          {
            agencyConfig: runtime.agencyConfig,
            model: runtime.model ?? undefined,
            params: {
              ...coordinator.params,
              ...(selectedOrchestratorId && { orchestratorSourceAgentId: selectedOrchestratorId }),
            },
            provider: runtime.provider ?? undefined,
            systemRole: prompt,
          },
          undefined,
          true,
        );
        if (pendingWorkingDirectorySource.current) {
          await copyOrchestratorWorkingDirectory(
            pendingWorkingDirectorySource.current,
            coordinator.id,
          );
          pendingWorkingDirectorySource.current = undefined;
        }
        await useAgentGroupStore.getState().refreshGroupDetail(groupId);
      }
      if (saveOpening) {
        await useAgentGroupStore.getState().updateGroup(groupId, {
          config: {
            ...group.config,
            openingMessage: opening,
            openingQuestions: questions.split('\n').filter((value) => value.trim()),
          },
        });
      }
      toast.success(t('group.settings.saved'));
    } catch (err) {
      console.error('Failed to save group settings:', err);
      setError(err);
    } finally {
      setPending(false);
    }
  };

  if (!group) return <ProfileSkeleton variant="group" />;

  return (
    <div className="h-full flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t('group.settings.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{group.title}</p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/group/${groupId}`)}>
            {t('group.settings.back')}
          </Button>
        </div>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (!pending) {
              setTab(String(value));
              setError(undefined);
            }
          }}
        >
          <TabsList className="max-w-full overflow-x-auto" variant="line">
            {(['basic', 'members', 'coordinator', 'opening', 'permissions'] as const).map(
              (value) => (
                <TabsTrigger disabled={pending} key={value} value={value}>
                  {t(`group.settings.tabs.${value}`)}
                </TabsTrigger>
              ),
            )}
          </TabsList>
          <TabsContent keepMounted value="basic">
            <BasicSettings />
          </TabsContent>
          <TabsContent className="flex flex-col gap-4" value="members">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('group.settings.memberDescription')}
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                {t('group.settings.addMembers')}
              </Button>
            </div>
            {!members.length && (
              <p className="rounded-lg border p-5 text-sm text-muted-foreground">
                {t('group.create.noParticipants')}
              </p>
            )}
            {members.map((member) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                key={member.id}
              >
                <Button
                  className="min-w-0 max-w-[45%]"
                  variant={selectedMember === member.id ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setSelectedMember(member.id);
                    useGroupProfileStore.setState({ activeTabId: member.id });
                  }}
                >
                  <span className="truncate">
                    {agentDisplayName(member, t('defaultSession', { ns: 'common' }))}
                  </span>
                </Button>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {t(member.virtual ? 'group.settings.groupOwned' : 'group.settings.sharedAgent')}
                </span>
                <Button
                  className="shrink-0"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    confirmModal({
                      content: t(
                        member.virtual
                          ? 'group.settings.deleteOwnedDescription'
                          : 'group.settings.removeSharedDescription',
                      ),
                      okButtonProps: { danger: true },
                      title: t(
                        member.virtual
                          ? 'group.settings.deleteOwned'
                          : 'group.settings.removeShared',
                      ),
                      onOk: async () => {
                        await useAgentGroupStore
                          .getState()
                          .removeAgentFromGroup(groupId, member.id);
                        if (selectedMember === member.id) setSelectedMember('');
                      },
                    })
                  }
                >
                  {t(member.virtual ? 'group.settings.deleteOwned' : 'group.settings.removeShared')}
                </Button>
              </div>
            ))}
            {selectedMember && members.some((member) => member.id === selectedMember) && (
              <MemberProfile key={selectedMember} />
            )}
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
          </TabsContent>
          <TabsContent className="flex flex-col gap-5" value="coordinator">
            <CoordinatorSummary config={runtime} />
            <ConfiguredOrchestratorSelector
              disabled={pending}
              value={selectedOrchestratorId}
              visibility={group.visibility}
              workspaceId={group.workspaceId ?? null}
              onSelect={selectOrchestrator}
              onUnavailable={invalidateOrchestrator}
            />
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('group.settings.coordinationInstructions')}
              <Textarea
                disabled={pending}
                rows={8}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
          </TabsContent>
          <TabsContent className="flex flex-col gap-5" value="opening">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('group.settings.openingMessage')}
              <Textarea
                disabled={pending}
                rows={5}
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('group.settings.openingQuestions')}
              <Textarea
                disabled={pending}
                rows={5}
                value={questions}
                onChange={(event) => setQuestions(event.target.value)}
              />
            </label>
          </TabsContent>
          <TabsContent className="flex flex-col gap-4" value="permissions">
            <p className="text-sm text-muted-foreground">
              {t(
                group.workspaceId
                  ? group.visibility === 'private'
                    ? 'group.settings.workspacePrivate'
                    : 'group.settings.workspaceShared'
                  : 'group.settings.personalScope',
              )}
            </p>
            {group.workspaceId && (
              <Button
                className="self-start"
                variant="outline"
                onClick={() => navigate(`/group/${groupId}/permission`)}
              >
                {t('permission.page.entry', { ns: 'setting' })}
              </Button>
            )}
          </TabsContent>
        </Tabs>
        {!!error && <AsyncError error={error} retrying={pending} onRetry={() => void save()} />}
        {(tab === 'coordinator' || tab === 'opening') && (
          <Button
            className="self-end"
            disabled={pending || (tab === 'coordinator' && !validCoordinator)}
            loading={pending}
            onClick={() => void save()}
          >
            {t('save', { ns: 'common' })}
          </Button>
        )}
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

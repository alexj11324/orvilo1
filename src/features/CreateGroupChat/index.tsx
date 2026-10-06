'use client';

import { t as translate } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import AsyncError from '@/components/AsyncError';
import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AgentRuntimeConfig } from '@/features/CreateAgent';
import ConfiguredOrchestratorSelector from '@/features/Orchestrator/ConfiguredOrchestratorSelector';
import { copyOrchestratorWorkingDirectory } from '@/features/Orchestrator/copyWorkingDirectory';
import { useOrchestratorPreference } from '@/features/Orchestrator/useOrchestratorPreference';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';
import { agentService, type AvailableAgentItem } from '@/services/agent';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { useHomeStore } from '@/store/home';

import { useGroupChatCreation } from './useGroupChatCreation';

export interface CreateGroupChatOptions {
  groupId?: string;
  onGenerate?: (context: { groupId?: string; visibility?: 'private' | 'public' }) => void;
  visibility?: 'private' | 'public';
}

export const CreateGroupChatContent = ({
  groupId,
  visibility,
  onGenerate,
}: CreateGroupChatOptions) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const { allowed: canCreate } = usePermission('create_content');
  const hasWorkspace = useHasActiveWorkspace();
  const orchestratorPreference = useOrchestratorPreference();
  const [selectedVisibility, setSelectedVisibility] = useState<'private' | 'public'>(
    visibility ?? 'private',
  );
  const categoryName = useHomeStore(
    (state) =>
      [...state.agentGroups, ...state.privateAgentGroups].find((group) => group.id === groupId)
        ?.name,
  );
  const loadRequest = useRef(0);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [agents, setAgents] = useState<AvailableAgentItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [orchestrator, setOrchestrator] = useState<{
    agentId: string;
    runtime?: AgentRuntimeConfig;
    visibility: 'private' | 'public';
    workspaceId: string | null | undefined;
  }>();
  const sameScope =
    !!orchestrator && orchestrator.workspaceId === orchestratorPreference.workspaceId;
  const orchestratorId = sameScope ? orchestrator?.agentId : orchestratorPreference.agentId;
  const runtime =
    sameScope && orchestrator?.visibility === selectedVisibility ? orchestrator.runtime : undefined;
  const selectOrchestrator = useCallback(
    (agentId: string, config: AgentRuntimeConfig) => {
      setOrchestrator({
        agentId,
        runtime: config,
        visibility: selectedVisibility,
        workspaceId: orchestratorPreference.workspaceId,
      });
    },
    [selectedVisibility, orchestratorPreference.workspaceId],
  );
  const clearOrchestratorRuntime = useCallback(() => {
    setOrchestrator((current) => (current?.runtime ? { ...current, runtime: undefined } : current));
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const { create: finishSetup, createdId, pending, error: createError } = useGroupChatCreation();
  const error = createError ?? loadError;

  const load = useCallback(async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    setLoadError(undefined);
    try {
      const rows = await agentService.queryAgents();
      // The creation endpoint validates saved runtime and visibility in the current workspace.
      const configured = await Promise.all(
        rows.map(async (agent) => {
          try {
            const config = await agentService.getRuntimeForCreation({
              agentId: agent.id,
              visibility: selectedVisibility,
            });
            return config.agencyConfig ? { agent, config } : undefined;
          } catch (err) {
            const { status } = normalizeAsyncError(err);
            if (status === 400 || status === 403 || status === 404 || status === 412)
              return undefined;
            throw err;
          }
        }),
      );
      if (request !== loadRequest.current) return;
      setAgents(configured.flatMap((item) => (item ? [item.agent] : [])));
    } catch (err) {
      if (request !== loadRequest.current) return;
      console.error('Failed to load group participants:', err);
      setLoadError(err);
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, [selectedVisibility]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!canCreate || !runtime || !title.trim()) return;
    const id = await finishSetup(
      {
        content: instructions,
        groupId,
        supervisorConfig: {
          agencyConfig: runtime.agencyConfig,
          model: runtime.model ?? undefined,
          params: { orchestratorSourceAgentId: orchestratorId },
          provider: runtime.provider ?? undefined,
        },
        title: title.trim(),
        visibility: selectedVisibility,
      },
      selected,
    );
    if (id) {
      const group = agentGroupSelectors.getGroupById(id)(useAgentGroupStore.getState());
      const coordinator = group?.agents.find((agent) => agent.isSupervisor);
      if (orchestratorId && coordinator)
        await copyOrchestratorWorkingDirectory(orchestratorId, coordinator.id);
      navigate(`/group/${id}`);
      close();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5 p-6">
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t('group.create.name')}
          <Input
            autoFocus
            disabled={pending || !!createdId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <details>
          <summary className="cursor-pointer text-sm">{t('group.create.scopeAndCategory')}</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('group.create.visibility')}
              {hasWorkspace && !groupId ? (
                <Select
                  disabled={pending || !!createdId}
                  value={selectedVisibility}
                  items={[
                    { value: 'private', label: t('group.create.privateScope') },
                    { value: 'public', label: t('group.create.workspaceScope') },
                  ]}
                  onValueChange={(value) => {
                    if (value !== 'private' && value !== 'public') return;
                    if (value === selectedVisibility) return;
                    ++loadRequest.current;
                    setSelectedVisibility(value);
                    setSelected([]);
                    setAgents([]);
                    setLoadError(undefined);
                    setLoading(true);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{t('group.create.privateScope')}</SelectItem>
                    <SelectItem value="public">{t('group.create.workspaceScope')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-normal text-muted-foreground">
                  {t(
                    !hasWorkspace
                      ? 'group.create.personalScope'
                      : selectedVisibility === 'private'
                        ? 'group.create.privateScope'
                        : 'group.create.workspaceScope',
                  )}
                </p>
              )}
            </label>
            <p className="text-sm">
              {t('group.create.category')}:{' '}
              {groupId
                ? categoryName || t('group.create.selectedCategory')
                : t('group.create.noCategory')}
            </p>
          </div>
        </details>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('group.create.participants')}</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('loading', { ns: 'common' })}</p>
          ) : (
            <div className="flex max-h-48 flex-col gap-2 overflow-auto rounded-lg border p-3">
              {agents.map((agent) => (
                <label className="flex items-center gap-2 text-sm" key={agent.id}>
                  <Checkbox
                    checked={selected.includes(agent.id)}
                    disabled={pending || !!createdId}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? [...selected, agent.id]
                          : selected.filter((id) => id !== agent.id),
                      )
                    }
                  />
                  {agent.name || agent.title}
                </label>
              ))}
              {!agents.length && (
                <p className="text-sm text-muted-foreground">
                  {t('group.create.noConfiguredAgents')}
                </p>
              )}
            </div>
          )}
          {!selected.length && (
            <p className="text-xs text-muted-foreground">{t('group.create.noParticipants')}</p>
          )}
        </section>
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <ConfiguredOrchestratorSelector
            disabled={pending || !!createdId || orchestratorPreference.loading}
            value={orchestratorId}
            visibility={selectedVisibility}
            workspaceId={orchestratorPreference.workspaceId}
            onSelect={selectOrchestrator}
            onUnavailable={clearOrchestratorRuntime}
          />
          {!!orchestratorPreference.error && (
            <AsyncError error={orchestratorPreference.error} variant="inline" />
          )}
        </section>
        <details>
          <summary className="cursor-pointer text-sm">{t('group.create.instructions')}</summary>
          <Textarea
            className="mt-3"
            disabled={pending || !!createdId}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </details>
        {!!error && (
          <AsyncError
            description={createdId ? t('group.create.partialFailure') : undefined}
            error={error}
            retrying={pending || loading}
            onRetry={() => void (createdId ? create() : load())}
          />
        )}
      </div>
      <ModalFooter>
        {onGenerate && (
          <Button
            disabled={pending || !!createdId}
            variant="ghost"
            onClick={() => {
              close();
              onGenerate({ groupId, visibility: selectedVisibility });
            }}
          >
            {t('group.create.generate')}
          </Button>
        )}
        <Button disabled={pending} variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          loading={pending}
          disabled={
            !canCreate ||
            pending ||
            loading ||
            orchestratorPreference.loading ||
            !runtime ||
            !title.trim()
          }
          onClick={() => void create()}
        >
          {t(createdId ? 'group.create.finish' : 'group.create.submit')}
        </Button>
      </ModalFooter>
    </>
  );
};

export const openCreateGroupChatModal = (options: CreateGroupChatOptions = {}) =>
  createModal({
    content: <CreateGroupChatContent {...options} />,
    footer: null,
    styles: { content: { padding: 0 } },
    title: translate('group.create.title', { ns: 'chat' }),
    width: 600,
  });

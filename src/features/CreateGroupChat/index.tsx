'use client';

import { canRunGroupSupervisorRuntime } from '@orvilo/heterogeneous-agents';
import { t as translate } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useHasActiveWorkspace } from '@/business/client/hooks/useHasActiveWorkspace';
import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncError from '@/components/AsyncError';
import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { Badge } from '@/components/reui/badge';
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
import { usePermission } from '@/hooks/usePermission';
import { agentService, type AvailableAgentItem } from '@/services/agent';
import { useHomeStore } from '@/store/home';

import { useGroupChatCreation } from './useGroupChatCreation';

export interface CreateGroupChatOptions {
  groupId?: string;
  visibility?: 'private' | 'public';
}

export const CreateGroupChatContent = ({ groupId, visibility }: CreateGroupChatOptions) => {
  const { t } = useTranslation(['chat', 'common']);
  const { close } = useModalContext();
  const { allowed: canCreate } = usePermission('create_content');
  const hasWorkspace = useHasActiveWorkspace();
  const [selectedVisibility, setSelectedVisibility] = useState<'private' | 'public'>(
    visibility ?? 'private',
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [agents, setAgents] = useState<AvailableAgentItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [coordinatorAgentId, setCoordinatorAgentId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const { create: finishSetup, createdId, pending, error: createError } = useGroupChatCreation();
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      setAgents(await agentService.queryAgents());
    } catch (cause) {
      console.error('Failed to load Group members:', cause);
      setLoadError(cause);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (
      !canCreate ||
      !title.trim() ||
      !coordinatorAgentId ||
      !selected.includes(coordinatorAgentId)
    )
      return;
    const id = await finishSetup(
      { title: title.trim(), content, groupId, visibility: selectedVisibility, coordinatorAgentId },
      selected,
    );
    if (id) {
      useHomeStore.getState().switchToGroup(id);
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
        <label className="flex flex-col gap-2 text-sm font-medium">
          {t('group.settings.description')}
          <Textarea
            disabled={pending || !!createdId}
            rows={5}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        {hasWorkspace && !groupId && (
          <Select
            disabled={pending || !!createdId}
            value={selectedVisibility}
            items={[
              { value: 'private', label: t('group.create.privateScope') },
              { value: 'public', label: t('group.create.workspaceScope') },
            ]}
            onValueChange={(value) => {
              if (value !== 'private' && value !== 'public') return;
              setSelectedVisibility(value);
            }}
          >
            <SelectTrigger aria-label={t('group.create.visibility')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t('group.create.privateScope')}</SelectItem>
              <SelectItem value="public">{t('group.create.workspaceScope')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t('group.create.participants')}</h3>
          {!coordinatorAgentId && (
            <p className="text-sm text-muted-foreground">{t('group.settings.chooseCoordinator')}</p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('loading', { ns: 'common' })}</p>
          ) : (
            <div className="flex max-h-64 flex-col gap-2 overflow-auto">
              {agents.map((agent) => (
                <div className="flex items-center gap-3 rounded-lg border p-3" key={agent.id}>
                  <Checkbox
                    aria-label={agent.name || agent.title || agent.id}
                    checked={selected.includes(agent.id)}
                    disabled={pending || !!createdId}
                    onCheckedChange={(checked) => {
                      setSelected((ids) =>
                        checked ? [...ids, agent.id] : ids.filter((id) => id !== agent.id),
                      );
                      if (!checked && coordinatorAgentId === agent.id)
                        setCoordinatorAgentId(undefined);
                    }}
                  />
                  <AgentRuntimeIcon size={24} type={agent.heterogeneousType} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {agent.name || agent.title}
                  </span>
                  {coordinatorAgentId === agent.id ? (
                    <Badge variant="secondary">{t('group.settings.coordinatorName')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        pending ||
                        !!createdId ||
                        !selected.includes(agent.id) ||
                        !canRunGroupSupervisorRuntime({ type: agent.heterogeneousType })
                      }
                      title={
                        !canRunGroupSupervisorRuntime({ type: agent.heterogeneousType })
                          ? t('group.settings.coordinatorUnavailable')
                          : undefined
                      }
                      onClick={() => setCoordinatorAgentId(agent.id)}
                    >
                      {t('group.settings.setCoordinator')}
                    </Button>
                  )}
                </div>
              ))}
              {!agents.length && (
                <p className="text-sm text-muted-foreground">
                  {t('group.create.noConfiguredAgents')}
                </p>
              )}
            </div>
          )}
        </section>
        {!!(createError ?? loadError) && (
          <AsyncError
            error={createError ?? loadError}
            retrying={pending || loading}
            onRetry={() => void (createError ? create() : load())}
          />
        )}
      </div>
      <ModalFooter>
        <Button disabled={pending} variant="outline" onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          loading={pending}
          disabled={
            !canCreate ||
            pending ||
            loading ||
            !!loadError ||
            !title.trim() ||
            !coordinatorAgentId ||
            !selected.includes(coordinatorAgentId)
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

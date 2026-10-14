import { t as translate } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { createModal, ModalFooter, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { SlackChannelBinding } from '@/services/slackIntegration';
import { slackIntegrationService } from '@/services/slackIntegration';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useFetchSlackChannels, useFetchSlackIntegration } from './hooks';
import { useBindingDraft } from './useBindingDraft';

interface BindingFormProps {
  binding?: SlackChannelBinding;
  onSaved: () => Promise<unknown>;
  workspaceId: string;
}
const BindingForm = ({ workspaceId, binding, onSaved }: BindingFormProps) => {
  const { t } = useTranslation('setting');
  const { close } = useModalContext();
  const userId = useUserStore(userProfileSelectors.userId);
  const initial = {
    agentId: binding?.agentId || '',
    projectId: binding?.projectId || '',
    repositoryId: binding?.repositoryId || '',
    slackChannelId: binding?.slackChannelId || '',
  };
  const { draft, setDraft, markSaved } = useBindingDraft(
    `slack-binding:${userId}:${workspaceId}:${binding?.id || 'new'}`,
    initial,
  );
  const agentId = typeof draft?.agentId === 'string' ? draft.agentId : '';
  const slackChannelId =
    binding?.slackChannelId ||
    (typeof draft?.slackChannelId === 'string' ? draft.slackChannelId : '');
  const projectId = typeof draft?.projectId === 'string' ? draft.projectId : '';
  const repositoryId = typeof draft?.repositoryId === 'string' ? draft.repositoryId : '';
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const status = useFetchSlackIntegration(workspaceId);
  const { channels, error, isLoading, isValidating, hasMore, size, setSize, mutate } =
    useFetchSlackChannels(
      workspaceId,
      Boolean(status.data?.installation && status.data?.canManage),
    );
  const agents = status.data?.availableAgents || [];
  const canSave = Boolean(
    status.data?.canManage &&
    status.data.installation &&
    agents.some((agent) => agent.id === agentId) &&
    (binding || channels.some((channel) => channel.id === slackChannelId)),
  );
  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await slackIntegrationService.saveBinding(workspaceId, slackChannelId, agentId, {
        projectId: projectId || null,
        repositoryId: repositoryId || null,
      });
      await onSaved();
      markSaved({ agentId, slackChannelId, projectId, repositoryId });
      close();
    } catch (error) {
      console.error('Slack channel binding failed', error);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="flex flex-col gap-5 p-5">
        {status.error && (
          <AsyncError
            error={status.error}
            variant="inline"
            onRetry={() => {
              void status.mutate();
            }}
          />
        )}
        {!status.isLoading && status.data && !status.data.canManage && (
          <p className="text-sm text-muted-foreground">{t('integrations.slack.adminRequired')}</p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="slack-channel">{t('integrations.slack.channel')}</label>
          {binding ? (
            <>
              <div className="rounded-(--radius-card) border border-border bg-secondary p-2 text-sm">
                #{binding.slackChannelName}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('integrations.slack.editChannelHint')}
              </p>
            </>
          ) : (
            <Select
              disabled={saving || !status.data?.canManage}
              value={slackChannelId}
              onValueChange={(value) => setDraft({ ...draft, slackChannelId: value || '' })}
            >
              <SelectTrigger className="w-full" id="slack-channel" size="normal">
                <SelectValue placeholder={t('integrations.slack.selectChannel')} />
              </SelectTrigger>
              <SelectContent>
                {channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    #{channel.name}
                    {channel.isPrivate ? ` · ${t('integrations.slack.private')}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!binding && isLoading && <Spinner aria-label={t('integrations.loading')} />}
          {!binding && error && (
            <AsyncError
              error={error}
              retrying={isValidating}
              variant="inline"
              onRetry={() => {
                void mutate();
              }}
            />
          )}
          {!binding &&
            !isLoading &&
            !error &&
            status.data?.installation &&
            channels.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('integrations.slack.noChannels')}</p>
            )}
          {!binding && hasMore && (
            <Button
              loading={isValidating}
              size="sm"
              variant="outline"
              onClick={() => {
                void setSize(size + 1);
              }}
            >
              {t('integrations.slack.moreChannels')}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="slack-agent">{t('integrations.slack.agent')}</label>
          <Select
            disabled={saving || !status.data?.canManage}
            value={agentId}
            onValueChange={(value) => setDraft({ ...draft, agentId: value || '' })}
          >
            <SelectTrigger className="w-full" id="slack-agent" size="normal">
              <SelectValue placeholder={t('integrations.slack.selectAgent')} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!status.isLoading && agents.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('integrations.slack.noAgents')}</p>
          )}
        </div>
        {(
          [
            {
              field: 'projectId',
              label: 'defaultProject',
              value: projectId,
              choices: status.data?.availableProjects,
            },
            {
              field: 'repositoryId',
              label: 'defaultRepository',
              value: repositoryId,
              choices: status.data?.availableRepositories,
            },
          ] as const
        ).map(({ field, label, value, choices }) => (
          <div className="flex flex-col gap-2" key={field}>
            <label htmlFor={`slack-${field}`}>{t(`integrations.slack.${label}`)}</label>
            <Select
              disabled={saving || !status.data?.canManage}
              value={value || '__none'}
              onValueChange={(selected) =>
                setDraft({ ...draft, [field]: selected === '__none' ? '' : selected || '' })
              }
            >
              <SelectTrigger className="w-full" id={`slack-${field}`} size="normal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t('integrations.slack.noDefault')}</SelectItem>
                {choices?.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {saveError && (
          <p className="text-sm text-destructive-text" role="alert">
            {t('integrations.slack.saveFailed')}
          </p>
        )}
      </div>
      <ModalFooter>
        <Button disabled={saving} size="lg" variant="outline" onClick={close}>
          {t('integrations.cancel')}
        </Button>
        <Button disabled={!canSave} loading={saving} size="lg" onClick={save}>
          {t('integrations.save')}
        </Button>
      </ModalFooter>
    </>
  );
};
export const openSlackBindingForm = (props: BindingFormProps) =>
  createModal({
    content: <BindingForm {...props} />,
    title: translate('integrations.slack.bindingTitle', { ns: 'setting' }),
    footer: null,
    maskClosable: false,
    width: 480,
  });

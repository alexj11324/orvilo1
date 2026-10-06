import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mcpEventsService } from '@/services/mcpEvents';
import { useMcpEventsStore } from '@/store/mcpEvents';

import { useTaskDetailTaskId } from '../AgentTasks/AgentTaskDetail/TaskDetailScope';
import { useSavedEventTrigger } from './useSavedEventTrigger';

function EventDefinitions({ connectorId, taskId }: { connectorId: string; taskId: string }) {
  const { t } = useTranslation('automation');
  const useFetch = useMcpEventsStore((s) => s.useFetchEventDefinitions);
  const { data, error, isLoading, mutate } = useFetch(taskId, connectorId);
  const useFetchTriggers = useMcpEventsStore((s) => s.useFetchEventTriggers);
  const triggers = useFetchTriggers(taskId);
  const [eventName, setEventName] = useState<string>();
  const [argumentsText, setArgumentsText] = useState('{}');
  const [repository, setRepository] = useState('');
  const [branch, setBranch] = useState('');
  const [action, setAction] = useState('opened');
  const [conclusion, setConclusion] = useState('any');
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const isGithub = data?.data.sourceType === 'github';
  const isPullRequest = eventName === 'github.pull_request';
  const events = data?.data.events.filter((event) => event.delivery.includes('webhook')) ?? [];
  const eventOptions = events.map((event) => ({
    label: isGithub
      ? t(`events.github.event.${event.name.slice(7)}`, { defaultValue: event.name })
      : event.name,
    value: event.name,
  }));
  const actionOptions = (['opened', 'reopened', 'synchronize', 'closed'] as const).map((value) => ({
    label: t(`events.github.action.${value}`),
    value,
  }));
  const conclusionOptions = (['any', 'success', 'failure'] as const).map((value) => ({
    label: t(`events.github.conclusion.${value}`),
    value,
  }));
  return (
    <AsyncBoundary
      data={data}
      empty={<span className={'text-muted-foreground'}>{t('events.unsupported')}</span>}
      error={error}
      isEmpty={data !== undefined && events.length === 0}
      isLoading={isLoading}
      onRetry={() => void mutate()}
    >
      <div className={'flex flex-col gap-2'}>
        <Select
          items={eventOptions}
          value={eventName ?? null}
          onValueChange={(value) => setEventName(value ?? undefined)}
        >
          <SelectTrigger aria-label={t('events.event')}>
            <SelectValue placeholder={t('events.event')} />
          </SelectTrigger>
          <SelectContent>
            {eventOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isGithub &&
          events
            .filter((event) => event.name === eventName)
            .map((event) => (
              <div className={'flex flex-col gap-0.5'} key={event.name}>
                <span className={'font-medium'}>{event.name}</span>
                {event.description && (
                  <span className={'text-muted-foreground'}>{event.description}</span>
                )}
                <details>
                  <summary>{t('events.argumentsSchema')}</summary>
                  <pre>{JSON.stringify(event.inputSchema, null, 2)}</pre>
                </details>
              </div>
            ))}

        <AsyncBoundary
          data={triggers.data}
          error={triggers.error}
          isLoading={triggers.isLoading}
          onRetry={() => void triggers.mutate()}
        >
          {triggers.data?.data.triggers.some(
            (trigger) => trigger.bindingState !== 'revoked',
          ) ? null : (
            <div className={'flex flex-col gap-2'}>
              {isGithub ? (
                <>
                  <label className={'flex flex-col gap-2'}>
                    <span>{t('events.github.repository')}</span>
                    <Input
                      placeholder={'owner/repository'}
                      value={repository}
                      onChange={(event) => setRepository(event.target.value)}
                    />
                  </label>
                  <label className={'flex flex-col gap-2'}>
                    <span>{t('events.github.branch')}</span>
                    <Input value={branch} onChange={(event) => setBranch(event.target.value)} />
                    <span className={'text-muted-foreground'}>{t('events.github.branchHint')}</span>
                  </label>
                  {eventName &&
                    (isPullRequest ? (
                      <div className={'flex flex-col gap-2'}>
                        <span>{t('events.github.action')}</span>
                        <Select
                          items={actionOptions}
                          value={action}
                          onValueChange={(value) => value && setAction(value)}
                        >
                          <SelectTrigger aria-label={t('events.github.action')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {actionOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className={'flex flex-col gap-2'}>
                        <span className={'text-muted-foreground'}>
                          {t('events.github.completedOnly')}
                        </span>
                        <span>{t('events.github.conclusion')}</span>
                        <Select
                          items={conclusionOptions}
                          value={conclusion}
                          onValueChange={(value) => value && setConclusion(value)}
                        >
                          <SelectTrigger aria-label={t('events.github.conclusion')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {conclusionOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                </>
              ) : (
                <Textarea
                  aria-label={t('events.arguments')}
                  value={argumentsText}
                  onChange={(event) => setArgumentsText(event.target.value)}
                />
              )}
              {!triggers.data?.data.canCreate && <span>{t('events.workspaceRequired')}</span>}
              <Button
                disabled={
                  !eventName ||
                  pending ||
                  !triggers.data?.data.canCreate ||
                  (isGithub && !repository.trim())
                }
                onClick={() => {
                  setPending(true);
                  setSaveError(undefined);
                  void (async () => {
                    try {
                      if (isGithub && !/^[^/\s]+\/[^/\s]+$/.test(repository.trim()))
                        throw new Error(t('events.github.invalidRepository'));
                      const args: unknown = isGithub
                        ? { repository: repository.trim() }
                        : JSON.parse(argumentsText);
                      if (!args || typeof args !== 'object' || Array.isArray(args))
                        throw new Error(t('events.invalidArguments'));
                      await mcpEventsService.create({
                        taskId,
                        connectorId,
                        eventName: eventName!,
                        arguments: args as Record<string, unknown>,
                        filters: isGithub
                          ? [
                              {
                                path: ['action'],
                                operator: 'equals',
                                value: isPullRequest ? action : 'completed',
                              },
                              ...(branch.trim()
                                ? [
                                    {
                                      path: isPullRequest
                                        ? ['pull_request', 'head', 'ref']
                                        : eventName === 'github.workflow_run'
                                          ? ['workflow_run', 'head_branch']
                                          : eventName === 'github.check_run'
                                            ? ['check_run', 'check_suite', 'head_branch']
                                            : ['check_suite', 'head_branch'],
                                      operator: 'equals' as const,
                                      value: branch.trim(),
                                    },
                                  ]
                                : []),
                              ...(!isPullRequest && conclusion !== 'any'
                                ? [
                                    {
                                      path: [eventName!.slice(7), 'conclusion'],
                                      operator: 'equals' as const,
                                      value: conclusion,
                                    },
                                  ]
                                : []),
                            ]
                          : [],
                      });
                      await triggers.mutate();
                    } catch (error) {
                      setSaveError(error);
                    } finally {
                      setPending(false);
                    }
                  })();
                }}
              >
                {t(
                  pending
                    ? 'events.saving'
                    : isGithub
                      ? 'events.github.savePaused'
                      : 'events.savePaused',
                )}
              </Button>
            </div>
          )}
        </AsyncBoundary>
        {saveError !== undefined && <AsyncError error={saveError} variant={'inline'} />}
      </div>
    </AsyncBoundary>
  );
}

function GithubWebhookSetup({
  taskId,
  callbackUrl,
  repository,
  eventName,
}: {
  taskId: string;
  callbackUrl: string;
  repository: string;
  eventName: string;
}) {
  const { t } = useTranslation('automation');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const copy = async (secret: boolean) => {
    setPending(true);
    setError(undefined);
    try {
      const value = secret
        ? (await mcpEventsService.githubWebhookConfiguration(taskId)).data.secret
        : callbackUrl;
      await navigator.clipboard.writeText(value);
      toast.success(t(secret ? 'events.github.secretCopied' : 'events.github.urlCopied'));
    } catch {
      setError(new Error(t('events.github.copyFailed')));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={'flex flex-col gap-3 rounded-md border p-4'}>
      <span className={'font-medium'}>{t('events.github.setup')}</span>
      <span className={'text-muted-foreground'}>{t('events.github.setupHint')}</span>
      <span>{t('events.github.repositoryValue', { repository })}</span>
      <label className={'flex flex-col gap-2'}>
        <span>{t('events.github.payloadUrl')}</span>
        <Input readOnly value={callbackUrl} />
      </label>
      <div className={'flex flex-wrap gap-2'}>
        <Button disabled={pending} variant={'outline'} onClick={() => void copy(false)}>
          {t('events.github.copyUrl')}
        </Button>
        <Button disabled={pending} variant={'outline'} onClick={() => void copy(true)}>
          {t('events.github.copySecret')}
        </Button>
      </div>
      <span>{t('events.github.contentType')}</span>
      <span>
        {t('events.github.selectedEvent', {
          event: t(`events.github.event.${eventName.slice(7)}`, { defaultValue: eventName }),
        })}
      </span>
      <span className={'text-muted-foreground'}>{t('events.github.secretHint')}</span>
      {error !== undefined && <AsyncError error={error} variant={'inline'} />}
    </div>
  );
}

/** Saved bindings stay manageable even when source inventory/discovery is unavailable. */
function SavedEventTrigger({ taskId }: { taskId: string }) {
  const { t } = useTranslation('automation');
  const [deviceId, setDeviceId] = useState<string>();
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>();
  const [readiness, setReadiness] =
    useState<Awaited<ReturnType<typeof mcpEventsService.readiness>>['data']>();
  const { data, error, isLoading, mutate, trigger, pending, stopError, cleanupPending, stop } =
    useSavedEventTrigger(taskId);
  const observed = readiness ?? trigger?.readiness;
  const isGithub = trigger?.sourceType === 'github';
  const act = async (operation: 'enable' | 'pause' | 'check') => {
    if (!trigger) return;
    setActionPending(true);
    setActionError(undefined);
    try {
      if (operation === 'check') {
        setReadiness((await mcpEventsService.readiness(taskId, deviceId)).data);
      } else if (operation === 'pause') {
        await mcpEventsService.pause(taskId, trigger.revision);
        setReadiness(undefined);
      } else if (observed) {
        const result = await mcpEventsService.enable({
          taskId,
          triggerRevision: trigger.revision,
          definitionVersionId: observed.definitionVersionId,
          deviceId: deviceId ?? observed.deviceId,
        });
        if (!result.data.enabled) throw new Error(result.data.reasons.join(', '));
        setReadiness(undefined);
      }
      await mutate();
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(false);
    }
  };
  return (
    <AsyncBoundary data={data} error={error} isLoading={isLoading} onRetry={() => void mutate()}>
      {trigger && (
        <div className={'flex flex-col gap-2'}>
          <span>
            {trigger.bindingState === 'revoked'
              ? t('events.stopped')
              : trigger.bindingState === 'active'
                ? trigger.enabled
                  ? t('events.active')
                  : t('events.savedPaused')
                : t(
                    isGithub && trigger.bindingState === 'pending'
                      ? 'events.github.waiting'
                      : 'events.bindingUnavailable',
                  )}
          </span>
          {isGithub &&
            trigger.bindingState !== 'revoked' &&
            trigger.callbackUrl &&
            trigger.repository &&
            trigger.eventName && (
              <GithubWebhookSetup
                callbackUrl={trigger.callbackUrl}
                eventName={trigger.eventName}
                repository={trigger.repository}
                taskId={taskId}
              />
            )}
          {trigger.bindingState !== 'revoked' && (
            <div className={'flex flex-col gap-2'}>
              {observed && observed.devices.length > 1 && !observed.deviceId && (
                <Select
                  value={deviceId ?? null}
                  onValueChange={(value) => {
                    setDeviceId(value ?? undefined);
                    setReadiness(undefined);
                  }}
                >
                  <SelectTrigger aria-label={t('events.device')}>
                    <SelectValue placeholder={t('events.device')} />
                  </SelectTrigger>
                  <SelectContent>
                    {observed.devices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {observed?.deviceId && (
                <span>{t('events.boundDevice', { device: observed.deviceId })}</span>
              )}
              {observed?.reasons.map((reason) => (
                <span key={reason}>{t(`events.reason.${reason}`)}</span>
              ))}
              <Button disabled={pending || actionPending} onClick={() => void act('check')}>
                {t('events.checkReadiness')}
              </Button>
              <Button
                disabled={pending || actionPending || (!trigger.enabled && !observed?.canEnable)}
                onClick={() => void act(trigger.enabled ? 'pause' : 'enable')}
              >
                {t(trigger.enabled ? 'events.pause' : 'events.enable')}
              </Button>
            </div>
          )}
          <Button disabled={pending || actionPending} onClick={() => void stop()}>
            {t('events.stop')}
          </Button>
          {isGithub && (
            <span className={'text-muted-foreground'}>{t('events.github.stopHint')}</span>
          )}
          {cleanupPending && <span role={'status'}>{t('events.cleanupPending')}</span>}
          {actionError !== undefined && <AsyncError error={actionError} variant={'inline'} />}
          {stopError !== undefined && <AsyncError error={stopError} variant={'inline'} />}
        </div>
      )}
    </AsyncBoundary>
  );
}

export default function McpEventTriggerSettings() {
  const { t } = useTranslation('automation');
  const taskId = useTaskDetailTaskId();
  const [connectorId, setConnectorId] = useState<string>();
  const useFetch = useMcpEventsStore((s) => s.useFetchEventSources);
  const { data, error, isLoading, mutate } = useFetch(taskId);
  if (!taskId) return null;
  const sourceOptions = (data?.data ?? []).map((source) => ({
    label: source.name,
    value: source.id,
  }));
  return (
    <div className={'flex flex-col gap-3'}>
      <span className={'font-medium'}>{t('events.title')}</span>
      <SavedEventTrigger key={taskId} taskId={taskId} />
      <AsyncBoundary
        data={data}
        empty={<span className={'text-muted-foreground'}>{t('events.noSources')}</span>}
        error={error}
        isEmpty={data?.data.length === 0}
        isLoading={isLoading}
        onRetry={() => void mutate()}
      >
        <Select
          items={sourceOptions}
          value={connectorId ?? null}
          onValueChange={(value) => setConnectorId(value ?? undefined)}
        >
          <SelectTrigger aria-label={t('events.source')}>
            <SelectValue placeholder={t('events.source')} />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {connectorId && data?.data.some((source) => source.id === connectorId) && (
          <EventDefinitions
            connectorId={connectorId}
            key={`${taskId}:${connectorId}`}
            taskId={taskId}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

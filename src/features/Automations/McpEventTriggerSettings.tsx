import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
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
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const events = data?.data.events.filter((event) => event.delivery.includes('webhook')) ?? [];
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
          value={eventName ?? null}
          onValueChange={(value) => setEventName(value ?? undefined)}
        >
          <SelectTrigger aria-label={t('events.event')}>
            <SelectValue placeholder={t('events.event')} />
          </SelectTrigger>
          <SelectContent>
            {events.map((event) => (
              <SelectItem key={event.name} value={event.name}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {events
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
              <Textarea
                aria-label={t('events.arguments')}
                value={argumentsText}
                onChange={(event) => setArgumentsText(event.target.value)}
              />
              {!triggers.data?.data.canCreate && <span>{t('events.workspaceRequired')}</span>}
              <Button
                disabled={!eventName || pending || !triggers.data?.data.canCreate}
                onClick={() => {
                  setPending(true);
                  setSaveError(undefined);
                  void (async () => {
                    try {
                      const args: unknown = JSON.parse(argumentsText);
                      if (!args || typeof args !== 'object' || Array.isArray(args))
                        throw new Error(t('events.invalidArguments'));
                      await mcpEventsService.create({
                        taskId,
                        connectorId,
                        eventName: eventName!,
                        arguments: args as Record<string, unknown>,
                        filters: [],
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
                {t('events.savePaused')}
              </Button>
            </div>
          )}
        </AsyncBoundary>
        {saveError !== undefined && <AsyncError error={saveError} variant={'inline'} />}
      </div>
    </AsyncBoundary>
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
                : t('events.bindingUnavailable')}
          </span>
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
          value={connectorId ?? null}
          onValueChange={(value) => setConnectorId(value ?? undefined)}
        >
          <SelectTrigger aria-label={t('events.source')}>
            <SelectValue placeholder={t('events.source')} />
          </SelectTrigger>
          <SelectContent>
            {(data?.data ?? []).map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name}
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

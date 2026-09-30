import { Flexbox, TextArea } from '@lobehub/ui';
import { Button, Select, Text } from '@lobehub/ui/base-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
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
      empty={<Text type={'secondary'}>{t('events.unsupported')}</Text>}
      error={error}
      isEmpty={data !== undefined && events.length === 0}
      isLoading={isLoading}
      onRetry={() => void mutate()}
    >
      <Flexbox gap={8}>
        <Select
          aria-label={t('events.event')}
          options={events.map((event) => ({ label: event.name, value: event.name }))}
          placeholder={t('events.event')}
          value={eventName}
          onChange={(value) => setEventName(typeof value === 'string' ? value : undefined)}
        />
        {events
          .filter((event) => event.name === eventName)
          .map((event) => (
            <Flexbox gap={2} key={event.name}>
              <Text weight={500}>{event.name}</Text>
              {event.description && <Text type={'secondary'}>{event.description}</Text>}
              <details>
                <summary>{t('events.argumentsSchema')}</summary>
                <pre>{JSON.stringify(event.inputSchema, null, 2)}</pre>
              </details>
            </Flexbox>
          ))}
        <Text type={'secondary'}>{t('events.unavailable')}</Text>
        <AsyncBoundary
          data={triggers.data}
          error={triggers.error}
          isLoading={triggers.isLoading}
          onRetry={() => void triggers.mutate()}
        >
          {triggers.data?.data.triggers.some(
            (trigger) => trigger.bindingState !== 'revoked',
          ) ? null : (
            <Flexbox gap={8}>
              <TextArea
                aria-label={t('events.arguments')}
                value={argumentsText}
                onChange={(event) => setArgumentsText(event.target.value)}
              />
              {!triggers.data?.data.canCreate && <Text>{t('events.workspaceRequired')}</Text>}
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
            </Flexbox>
          )}
        </AsyncBoundary>
        {saveError !== undefined && <AsyncError error={saveError} variant={'inline'} />}
        <Button disabled>{t('events.enable')}</Button>
      </Flexbox>
    </AsyncBoundary>
  );
}

/** Saved bindings stay manageable even when source inventory/discovery is unavailable. */
function SavedEventTrigger({ taskId }: { taskId: string }) {
  const { t } = useTranslation('automation');
  const { data, error, isLoading, mutate, trigger, pending, stopError, cleanupPending, stop } =
    useSavedEventTrigger(taskId);
  return (
    <AsyncBoundary data={data} error={error} isLoading={isLoading} onRetry={() => void mutate()}>
      {trigger && (
        <Flexbox gap={8}>
          <Text>
            {trigger.bindingState === 'revoked'
              ? t('events.stopped')
              : trigger.bindingState === 'active'
                ? t('events.savedPaused')
                : t('events.bindingUnavailable')}
          </Text>
          <Button disabled={pending} onClick={() => void stop()}>
            {t('events.stop')}
          </Button>
          {cleanupPending && <Text role={'status'}>{t('events.cleanupPending')}</Text>}
          {stopError !== undefined && <AsyncError error={stopError} variant={'inline'} />}
        </Flexbox>
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
    <Flexbox gap={12}>
      <Text weight={500}>{t('events.title')}</Text>
      <SavedEventTrigger key={taskId} taskId={taskId} />
      <AsyncBoundary
        data={data}
        empty={<Text type={'secondary'}>{t('events.noSources')}</Text>}
        error={error}
        isEmpty={data?.data.length === 0}
        isLoading={isLoading}
        onRetry={() => void mutate()}
      >
        <Select
          aria-label={t('events.source')}
          options={(data?.data ?? []).map((source) => ({ label: source.name, value: source.id }))}
          placeholder={t('events.source')}
          value={connectorId}
          onChange={(value) => setConnectorId(typeof value === 'string' ? value : undefined)}
        />
        {connectorId && data?.data.some((source) => source.id === connectorId) && (
          <EventDefinitions
            connectorId={connectorId}
            key={`${taskId}:${connectorId}`}
            taskId={taskId}
          />
        )}
      </AsyncBoundary>
    </Flexbox>
  );
}

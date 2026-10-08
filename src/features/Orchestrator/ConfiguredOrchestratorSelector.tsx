'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import type { AgentRuntimeConfig } from '@/features/CreateAgent';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useClientDataSWR } from '@/libs/swr';
import { listConfiguredOrchestrators } from '@/services/orchestrator';
import { resolveAgentRuntimeType } from '@/utils/agentRuntimeIdentity';

export interface ConfiguredOrchestratorSelectorProps {
  disabled?: boolean;
  onCreated?: (agentId: string) => Promise<void>;
  onSelect: (agentId: string, runtime: AgentRuntimeConfig, explicit?: boolean) => void;
  onUnavailable?: () => void;
  value?: string;
  visibility?: 'private' | 'public';
  workspaceId?: string | null;
}

const ConfiguredOrchestratorSelector = ({
  disabled,
  onSelect,
  onUnavailable,
  value,
  visibility = 'private',
  workspaceId: scope,
}: ConfiguredOrchestratorSelectorProps) => {
  const { t } = useTranslation(['setting', 'chat', 'common']);
  const activeWorkspaceId = useActiveWorkspaceId();
  const workspaceId = scope === undefined ? activeWorkspaceId : scope;
  const navigate = useWorkspaceAwareNavigate();
  const notified = useRef<string | undefined>(undefined);
  const notifiedRuntime = useRef<AgentRuntimeConfig | undefined>(undefined);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const { data, error, isLoading, mutate } = useClientDataSWR(
    ['configured-orchestrators', workspaceId, visibility],
    () => listConfiguredOrchestrators(workspaceId, visibility),
  );
  const selected = data?.find((item) => item.agent.id === value && item.status === 'ready');
  const selectionKey = `${workspaceId ?? 'personal'}:${visibility}:${value ?? ''}`;
  useEffect(() => {
    if (!selected?.runtime) {
      notified.current = undefined;
      onUnavailable?.();
      return;
    }
    if (notified.current === selectionKey && notifiedRuntime.current === selected.runtime) return;
    notified.current = selectionKey;
    notifiedRuntime.current = selected.runtime;
    callback.current(selected.agent.id, selected.runtime);
  }, [selected, selectionKey, onUnavailable]);
  return (
    <div className="flex flex-col gap-3">
      {isLoading && !data ? (
        <Spinner />
      ) : error ? (
        <AsyncError error={error} onRetry={() => void mutate()} />
      ) : (
        <RadioGroup
          aria-label={t('orchestrator.select')}
          className="max-h-64 overflow-auto rounded-lg border p-3"
          value={value ?? ''}
          onValueChange={(next) => {
            const item = data?.find(({ agent }) => agent.id === next);
            if (!item?.runtime) return;
            notified.current = `${workspaceId ?? 'personal'}:${visibility}:${item.agent.id}`;
            notifiedRuntime.current = item.runtime;
            onSelect(item.agent.id, item.runtime, true);
          }}
        >
          {data?.map(({ agent, runtime, status }) => (
            <div className="flex items-center gap-2" key={agent.id}>
              <Label className="min-w-0 flex-1 cursor-pointer gap-3 rounded-md p-3 leading-normal font-normal hover:bg-accent has-data-checked:bg-selected has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50">
                <RadioGroupItem disabled={disabled || status !== 'ready'} value={agent.id} />
                <AgentRuntimeIcon
                  size={24}
                  type={runtime ? resolveAgentRuntimeType(runtime) : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{agent.name || agent.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {runtime?.agencyConfig?.heterogeneousProvider?.type} ·{' '}
                    {status === 'unsupported'
                      ? t('orchestrator.unsupported')
                      : status === 'ready'
                        ? t('orchestrator.ready')
                        : t(`chat:agentPicker.status.${status}`)}
                  </span>
                </span>
              </Label>
              {status !== 'ready' && (
                <Button
                  disabled={disabled}
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`/agent/${agent.id}/profile`)}
                >
                  {t('chat:agentPicker.configure')}
                </Button>
              )}
            </div>
          ))}
          {!data?.length && (
            <p className="text-sm text-muted-foreground">{t('orchestrator.empty')}</p>
          )}
        </RadioGroup>
      )}
      {value && data && !selected && (
        <p className="text-sm text-destructive">{t('orchestrator.selectionUnavailable')}</p>
      )}
    </div>
  );
};
export default ConfiguredOrchestratorSelector;

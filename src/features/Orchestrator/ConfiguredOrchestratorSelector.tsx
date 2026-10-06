'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { AgentRuntimeConfig } from '@/features/CreateAgent';
import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';
import { CoordinatorSummary } from '@/features/GroupProfile/CoordinatorSummary';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useClientDataSWR } from '@/libs/swr';
import {
  getConfiguredOrchestratorRuntime,
  listConfiguredOrchestrators,
} from '@/services/orchestrator';

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
  onCreated,
  value,
  visibility = 'private',
  workspaceId: scope,
}: ConfiguredOrchestratorSelectorProps) => {
  const { t } = useTranslation(['setting', 'chat', 'common']);
  const activeWorkspaceId = useActiveWorkspaceId();
  const workspaceId = scope === undefined ? activeWorkspaceId : scope;
  const navigate = useWorkspaceAwareNavigate();
  const [creating, setCreating] = useState(false);
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
        <div
          aria-label={t('orchestrator.select')}
          className="flex max-h-64 flex-col gap-2 overflow-auto rounded-lg border p-3"
        >
          {data?.map(({ agent, runtime, status }) => (
            <div className="flex items-center gap-2" key={agent.id}>
              <Button
                aria-pressed={agent.id === value}
                className="h-auto min-w-0 flex-1 justify-start gap-3 p-3 text-left"
                disabled={disabled || status !== 'ready'}
                variant={agent.id === value ? 'secondary' : 'ghost'}
                onClick={() => {
                  if (runtime) {
                    notified.current = `${workspaceId ?? 'personal'}:${visibility}:${agent.id}`;
                    notifiedRuntime.current = runtime;
                    onSelect(agent.id, runtime, true);
                  }
                }}
              >
                <AgentRuntimeIcon
                  size={24}
                  type={runtime?.agencyConfig?.heterogeneousProvider?.type}
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
              </Button>
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
        </div>
      )}
      {selected?.runtime && (
        <CoordinatorSummary
          config={{ ...selected.runtime, title: selected.agent.name || selected.agent.title }}
        />
      )}
      {value && data && !selected && (
        <p className="text-sm text-destructive">{t('orchestrator.selectionUnavailable')}</p>
      )}
      {creating ? (
        <CreateAgentPanel
          visibility={visibility}
          onCancel={() => setCreating(false)}
          onCreated={async (id) => {
            await onCreated?.(id);
            await mutate();
            setCreating(false);
            const runtime = await getConfiguredOrchestratorRuntime(id, workspaceId, visibility);
            onSelect(id, { ...runtime, agencyConfig: runtime.agencyConfig ?? undefined }, true);
          }}
        />
      ) : (
        <Button
          className="self-start"
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => setCreating(true)}
        >
          {t('orchestrator.create')}
        </Button>
      )}
    </div>
  );
};
export default ConfiguredOrchestratorSelector;

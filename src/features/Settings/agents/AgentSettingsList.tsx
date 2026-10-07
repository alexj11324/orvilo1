'use client';

import { HETEROGENEOUS_TYPE_LABELS } from '@orvilo/heterogeneous-agents';
import { agentDisplayName } from '@orvilo/types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncBoundary from '@/components/AsyncBoundary';
import AsyncError from '@/components/AsyncError';
import { Badge } from '@/components/reui/badge';
import SettingsSectionSkeleton from '@/components/Skeleton/Settings/Section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { resolveServerDefaultModelMeta } from '@/features/HeterogeneousAgent/modelPicker';
import { type AgentRow, useHomeAgentRows } from '@/features/Home/AgentSelect/useHomeAgentRows';
import { resolveTargetDeviceId } from '@/helpers/agentWorkingDirectory';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useClientDataSWRWithSync } from '@/libs/swr';
import { agentConfigKeys } from '@/libs/swr/keys';
import { getHostContext } from '@/platform';
import { agentService } from '@/services/agent';
import { useAgentStore } from '@/store/agent';
import { useAiInfraStore } from '@/store/aiInfra';
import { useElectronStore } from '@/store/electron';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';

import { agentSettingsRowState } from './agentSettingsRowState';

const AgentSettingsListRow = ({
  row,
  onSelect,
}: {
  row: AgentRow;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation(['setting', 'chat']);
  const desktop = getHostContext().kind === 'desktop';
  const configFetch = useClientDataSWRWithSync(
    agentConfigKeys.config(row.id),
    () => agentService.getAgentConfigById(row.id),
    {
      onData: (data) => {
        if (data)
          useAgentStore.setState((state) => ({ agentMap: { ...state.agentMap, [row.id]: data } }));
      },
    },
  );
  const config = configFetch.data;
  const { agencyConfig, workspaceScoped, isPreferenceLoading } = useEffectiveAgencyConfig(row.id);
  const devices = useDeviceList();
  const bindings = useProviderBindingStore((s) => s.bindings);
  const provider = config?.agencyConfig?.heterogeneousProvider;
  const bindingFetch = useFetchProviderBindings(provider?.type === 'orvilo');
  const builtinAiModelList = useAiInfraStore((s) => s.builtinAiModelList);
  const target = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: desktop,
    isHetero: !!provider,
    workspaceScoped,
  });
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const deviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId, { workspaceScoped });
  const device = devices.data?.find((item) => item.deviceId === deviceId);
  const needsDevices = target === 'device';
  const waiting =
    configFetch.isLoading ||
    isPreferenceLoading ||
    (needsDevices && devices.isLoading) ||
    (provider?.type === 'orvilo' && bindingFetch.isLoading);
  const error =
    configFetch.error ||
    (needsDevices && devices.error) ||
    (provider?.type === 'orvilo' && bindingFetch.error);
  const { state } = agentSettingsRowState({
    profile: config,
    loading: waiting,
    error,
    agencyConfig,
    devices: devices.data ?? [],
    bindings,
    desktop,
    workspaceScoped,
  });
  const model = provider?.apiConfig?.model ?? provider?.model;
  const modelLabel =
    provider?.type === 'orvilo' && model
      ? resolveServerDefaultModelMeta(model, builtinAiModelList)?.displayName
      : undefined;
  const deviceLabel =
    device?.friendlyName ||
    device?.hostname ||
    (target === 'local'
      ? t('chat:heteroAgent.executionTarget.local')
      : t('settingAgent.list.noDevice'));
  return (
    <div className="flex items-center gap-3 border-b py-4 last:border-0">
      <AgentRuntimeIcon size={32} type={provider?.type ?? row.heterogeneousType} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{agentDisplayName(config, row.title)}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {provider
            ? (HETEROGENEOUS_TYPE_LABELS[provider.type] ?? provider.type)
            : t('settingAgent.generalSettings.legacyName')}{' '}
          · {model ? (modelLabel ?? model) : t('chat:heteroAgent.modelSelector.default')} ·{' '}
          {deviceLabel}
        </div>
        {error ? (
          <AsyncError
            error={error}
            variant="inline"
            onRetry={() => {
              void configFetch.mutate();
              void devices.mutate();
              void bindingFetch.mutate();
            }}
          />
        ) : (
          <Badge
            className="mt-2"
            variant={
              state === 'needsConfiguration' || state === 'offline' || state === 'unavailable'
                ? 'warning-light'
                : 'secondary'
            }
          >
            {t(`settingAgent.list.${state}`)}
          </Badge>
        )}
      </div>
      <Button
        disabled={state === 'unavailable'}
        size="sm"
        variant="outline"
        onClick={() => onSelect(row.id)}
      >
        {t('settingAgent.list.configure')}
      </Button>
    </div>
  );
};

export const AgentSettingsList = ({
  error,
  onRetry,
  onSelect,
}: {
  error?: unknown;
  onRetry: () => void;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation('setting');
  const workspaceId = useActiveWorkspaceId();
  const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
  const { privateRows, workspaceRows } = useHomeAgentRows({ includeTaskAgent: true });
  const [scope, setScope] = useState<'all' | 'private' | 'workspace'>('all');
  const [query, setQuery] = useState('');
  const personalRows = workspaceId ? privateRows : [...workspaceRows, ...privateRows];
  const sharedRows = workspaceId ? workspaceRows : [];
  const rows = (
    scope === 'private'
      ? personalRows
      : scope === 'workspace'
        ? sharedRows
        : [...personalRows, ...sharedRows]
  ).filter((row) =>
    `${row.title} ${row.heterogeneousType ?? ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'private', ...(workspaceId ? (['workspace'] as const) : [])] as const).map(
          (value) => (
            <Button
              aria-pressed={scope === value}
              key={value}
              size="sm"
              variant={scope === value ? 'secondary' : 'ghost'}
              onClick={() => setScope(value)}
            >
              {t(`settingAgent.list.${value}`)}
            </Button>
          ),
        )}
        <Input
          aria-label={t('settingAgent.list.search')}
          className="ml-auto w-full sm:w-60"
          placeholder={t('settingAgent.list.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <AsyncBoundary
        data={isInit ? true : undefined}
        error={error}
        isLoading={!isInit && !error}
        loading={<SettingsSectionSkeleton />}
        onRetry={onRetry}
      >
        {rows.length ? (
          rows.map((row) => <AgentSettingsListRow key={row.id} row={row} onSelect={onSelect} />)
        ) : (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            {t(query ? 'settingAgent.list.noResults' : 'settingAgent.list.empty')}
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
};

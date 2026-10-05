'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { HeterogeneousReasoningEffort, OrviloAgentConfig } from '@orvilo/types';
import { HETEROGENEOUS_AGENT_DEFAULT_SELECTION } from '@orvilo/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isBuiltinAgentUsable } from '@/features/AgentOnboarding/availability';
import { ProviderSetupFields } from '@/features/AgentOnboarding/ProviderSetupFields';
import { getEffortLabelKeys } from '@/features/ChatInput/ControlBar/HeteroModel/labels';
import {
  MODEL_LABELS,
  modelDisplayLabel,
} from '@/features/ChatInput/ControlBar/HeteroModel/modelOptions';
import { buildConnectAgentConfig, getConnectableProvider } from '@/features/ConnectAgent/providers';
import { useAgentScan } from '@/features/ConnectAgent/useAgentScan';
import { getDeviceLabel } from '@/features/DeviceManager/getDeviceLabel';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import {
  type FirstAgentProviderCheckpoint,
  firstPrimeAgentConfig,
  prepareFirstAgentProvider,
} from '@/services/agentOnboarding';
import { deviceService } from '@/services/device';
import { providerBindingService } from '@/services/providerBinding';
import { useFetchProviderBindings, useProviderBindingStore } from '@/store/providerBinding';

import { AgentModelPicker } from './AgentModelPicker';
import {
  type AgentChoice,
  BUILTIN_AGENT_KEY,
  effortOptionsFor,
  hasModelStep,
  installedProviders,
  validEffortFor,
} from './agentOptions';
import { useAgentModelOptions } from './useAgentModelOptions';
import { eligibleExecutionDevices, useExecutionHost } from './useExecutionHost';

export interface RuntimeRequest {
  builtinOnly?: boolean;
  visibility?: 'private' | 'public';
}

export const useAgentRuntimeForm = ({
  builtinOnly,
  visibility = 'private',
  initialType,
}: RuntimeRequest & { initialType?: HeterogeneousAgentType }) => {
  const workspaceId = useActiveWorkspaceId();
  const host = useExecutionHost(visibility);
  const { scan, reset, state } = useAgentScan();
  const providerFetch = useFetchProviderBindings();
  const bindings = useProviderBindingStore((s) => s.bindings).filter((binding) =>
    isBuiltinAgentUsable([binding]),
  );
  const [choice, setChoice] = useState<AgentChoice>(
    builtinOnly ? BUILTIN_AGENT_KEY : (initialType ?? BUILTIN_AGENT_KEY),
  );
  const [model, setModel] = useState(HETEROGENEOUS_AGENT_DEFAULT_SELECTION as string);
  const [effort, setEffort] = useState<HeterogeneousReasoningEffort>(
    HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
  );
  const [bindingId, setBindingId] = useState<string>();
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1');
  const [apiModel, setApiModel] = useState('');
  const providerCheckpoint = useRef<FirstAgentProviderCheckpoint>({});
  const [scannedHostId, setScannedHostId] = useState<string>();
  const provider = choice === BUILTIN_AGENT_KEY ? undefined : getConnectableProvider(choice);
  const installed = installedProviders(state.agents);
  const selectedBindingId = bindingId ?? bindings[0]?.id ?? 'configure';
  const binding = bindings.find((item) => item.id === selectedBindingId);
  const modelOptions = useAgentModelOptions({
    deviceId: host.deviceId,
    enabled: !!host.deviceId && hasModelStep(provider?.type),
    isLocal: host.isLocal,
    provider,
  });
  const efforts = effortOptionsFor(provider?.type, model);
  const rescan = () => {
    setScannedHostId(undefined);
    const target = host.isLocal
      ? { kind: 'local' as const }
      : host.device
        ? { device: host.device, kind: 'device' as const }
        : undefined;
    if (target) void scan(target).then(() => setScannedHostId(host.deviceId));
  };
  useEffect(() => {
    reset();
    setScannedHostId(undefined);
    if (host.loading || builtinOnly) return;
    let active = true;
    const target = host.isLocal
      ? { kind: 'local' as const }
      : host.device
        ? { device: host.device, kind: 'device' as const }
        : undefined;
    if (target)
      void scan(target).then(() => {
        if (active) setScannedHostId(host.deviceId);
      });
    return () => {
      active = false;
    };
  }, [host.deviceId, host.device, host.loading, host.isLocal, builtinOnly, reset, scan]);
  useEffect(() => {
    const valid = validEffortFor(provider?.type, model, effort);
    if (valid !== effort) setEffort(valid);
  }, [effort, model, provider?.type]);
  const selectChoice = (value: AgentChoice) => {
    setChoice(value);
    setModel(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
    setEffort(HETEROGENEOUS_AGENT_DEFAULT_SELECTION);
  };
  const ready =
    !!host.deviceId &&
    !host.loading &&
    (choice === BUILTIN_AGENT_KEY
      ? !providerFetch.isLoading &&
        !providerFetch.error &&
        (!!binding || (!!apiKey.trim() && !!apiModel.trim() && !!endpoint.trim()))
      : scannedHostId === host.deviceId &&
        state.status === 'success' &&
        installed.some((item) => item.type === choice) &&
        !modelOptions.loading &&
        !modelOptions.error);

  const prepare = async (): Promise<Partial<OrviloAgentConfig>> => {
    if (!ready || !host.deviceId) throw new Error('FIRST_AGENT_REQUIRED');
    if (!host.isLocal || choice === BUILTIN_AGENT_KEY) {
      const devices = await deviceService.listDevices();
      if (
        !eligibleExecutionDevices(devices, workspaceId, visibility).some(
          (device) => device.deviceId === host.deviceId,
        )
      )
        throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
    }
    if (choice === BUILTIN_AGENT_KEY) {
      const selected =
        binding ??
        (await prepareFirstAgentProvider(
          { apiKey, endpoint, model: apiModel },
          providerCheckpoint.current,
        ));
      if (
        (await providerBindingService.checkConnection(selected.id, selected.revision)).status !==
        'ready'
      )
        throw new Error('PROVIDER_CHECK_UNAVAILABLE');
      return {
        ...firstPrimeAgentConfig(selected.model, host.deviceId),
        model: selected.model,
        provider: selected.provider,
      };
    }
    if (!provider || !installed.some((item) => item.type === choice))
      throw new Error('CREATE_AGENT_NO_PROVIDER');
    return buildConnectAgentConfig({
      effort: validEffortFor(provider.type, model, effort),
      model,
      provider,
      target: host.isLocal
        ? { deviceId: host.deviceId, kind: 'local' }
        : { deviceId: host.deviceId, kind: 'device' },
    });
  };
  return {
    apiKey,
    apiModel,
    binding,
    builtinOnly,
    choice,
    efforts,
    endpoint,
    host,
    installed,
    model,
    modelOptions,
    prepare,
    provider,
    providerFetch,
    ready,
    rescan,
    selectedBindingId,
    bindings,
    setApiKey,
    setApiModel,
    setBindingId,
    setEffort,
    setEndpoint,
    setModel,
    selectChoice,
    state,
    effort,
  };
};

export const RuntimeFields = ({
  form,
  disabled,
}: {
  disabled?: boolean;
  form: ReturnType<typeof useAgentRuntimeForm>;
}) => {
  const { t } = useTranslation(['chat', 'common']);
  const navigate = useWorkspaceAwareNavigate();
  const { host, choice } = form;
  const builtin = choice === BUILTIN_AGENT_KEY;
  const agentLabel = builtin ? 'Orvilo AI' : form.provider?.title;
  const effortLabels = getEffortLabelKeys(form.provider?.type);
  return (
    <div className="flex flex-col gap-4">
      {!form.builtinOnly && (
        <label className="flex flex-col gap-2 text-sm">
          {t('createAgent.step.agent')}
          <Select
            disabled={disabled}
            value={choice}
            onValueChange={(value) => {
              if (value) form.selectChoice(value as AgentChoice);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{() => agentLabel ?? t('createAgent.choose')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BUILTIN_AGENT_KEY}>Orvilo AI</SelectItem>
              {form.installed.map((provider) => (
                <SelectItem key={provider.type} value={provider.type}>
                  {provider.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm">
        {t('creation.runtime.host')}
        <Select
          disabled={disabled || host.loading}
          value={host.deviceId ?? null}
          onValueChange={(value) => {
            host.select(value ?? undefined);
            form.selectChoice(BUILTIN_AGENT_KEY);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={t(
                host.loading ? 'createAgent.host.loading' : 'creation.runtime.hostEmpty',
              )}
            >
              {() =>
                host.isLocal
                  ? t('connectAgent.create.localDevice')
                  : host.device
                    ? getDeviceLabel(host.device, t('common:desktop'))
                    : t('creation.runtime.hostEmpty')
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {host.localDeviceId && (
              <SelectItem value={host.localDeviceId}>
                {t('connectAgent.create.localDevice')}
              </SelectItem>
            )}
            {host.devices
              .filter((device) => device.deviceId !== host.localDeviceId)
              .map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {getDeviceLabel(device, t('common:desktop'))}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </label>
      {host.error && (
        <AsyncError error={host.error} variant="inline" onRetry={() => void host.retry()} />
      )}
      {host.exhausted && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <span>{t('createAgent.hostExhausted')}</span>
          <Button type="button" variant="outline" onClick={() => navigate('/settings/devices')}>
            {t('createAgent.hostExhaustedAction')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void host.retry()}>
            {t('createAgent.retry')}
          </Button>
        </div>
      )}
      {!form.builtinOnly && host.deviceId && (
        <div className="text-xs text-muted-foreground">
          {form.state.status === 'scanning' || form.state.status === 'idle' ? (
            t('localHarness.scanning')
          ) : form.state.status === 'error' ? (
            <AsyncError
              description={t('createAgent.scan.error')}
              error={form.state.error}
              variant="inline"
              onRetry={form.rescan}
            />
          ) : (
            <div className="flex items-center justify-between">
              <span>
                {form.installed.length ? t('createAgent.installed') : t('createAgent.installHint')}
              </span>
              <Button
                disabled={disabled}
                size="sm"
                type="button"
                variant="ghost"
                onClick={form.rescan}
              >
                {t('createAgent.rescan')}
              </Button>
            </div>
          )}
        </div>
      )}
      {!builtin &&
        form.state.status === 'success' &&
        !form.installed.some((provider) => provider.type === choice) && (
          <p className="text-sm text-destructive">{t('createAgent.selectedUnavailable')}</p>
        )}
      {builtin ? (
        <>
          {form.providerFetch.error ? (
            <AsyncError
              error={form.providerFetch.error}
              variant="inline"
              onRetry={() => void form.providerFetch.mutate()}
            />
          ) : (
            <label className="flex flex-col gap-2 text-sm">
              {t('creation.runtime.provider')}
              <AgentModelPicker
                disabled={disabled || form.providerFetch.isLoading}
                loading={form.providerFetch.isLoading}
                value={form.selectedBindingId}
                options={[
                  ...form.bindings.map((binding) => ({
                    label:
                      MODEL_LABELS[binding.model] ??
                      modelDisplayLabel({ id: binding.model, modelId: binding.model }),
                    description: binding.name || binding.provider,
                    value: binding.id,
                  })),
                  { label: t('onboarding.api.configure'), value: 'configure' },
                ]}
                onChange={form.setBindingId}
              />
            </label>
          )}
          {!form.providerFetch.isLoading && form.selectedBindingId === 'configure' && (
            <ProviderSetupFields
              apiKey={form.apiKey}
              configDisabled={disabled}
              endpoint={form.endpoint}
              keyDisabled={disabled}
              model={form.apiModel}
              onApiKeyChange={form.setApiKey}
              onEndpointChange={form.setEndpoint}
              onModelChange={form.setApiModel}
            />
          )}
        </>
      ) : (
        <>
          {form.modelOptions.supported && (
            <label className="flex flex-col gap-2 text-sm">
              {t('createAgent.step.model')}
              <AgentModelPicker
                disabled={disabled}
                error={form.modelOptions.error}
                loading={form.modelOptions.loading}
                value={form.model}
                options={[
                  {
                    label: t('heteroAgent.modelSelector.default'),
                    value: HETEROGENEOUS_AGENT_DEFAULT_SELECTION,
                  },
                  ...form.modelOptions.options,
                ]}
                onChange={form.setModel}
                onRetry={form.modelOptions.retry}
              />
            </label>
          )}
          {!!form.efforts.length && (
            <label className="flex flex-col gap-2 text-sm">
              {t('createAgent.step.strength')}
              <Select
                disabled={disabled}
                value={form.effort}
                onValueChange={(value) => {
                  if (value) form.setEffort(value as HeterogeneousReasoningEffort);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{() => t(effortLabels[form.effort])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {form.efforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t(effortLabels[effort])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        </>
      )}
    </div>
  );
};

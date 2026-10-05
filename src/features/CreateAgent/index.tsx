'use client';

import type { DeviceListItem, OrviloAgentConfig, ProviderBinding } from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { t as i18nT } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { createModal, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProviderSetupFields } from '@/features/AgentOnboarding/ProviderSetupFields';
import { getDeviceLabel } from '@/features/DeviceManager/getDeviceLabel';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { agentService } from '@/services/agent';
import {
  type FirstAgentProviderCheckpoint,
  firstPrimeAgentConfig,
  prepareFirstAgentProvider,
} from '@/services/agentOnboarding';
import { deviceService } from '@/services/device';
import { homeService } from '@/services/home';
import { providerBindingService } from '@/services/providerBinding';

export type AgentRuntimeConfig = Pick<OrviloAgentConfig, 'agencyConfig'> & {
  // A saved external runtime (imported CLI adapters) may carry no selected
  // model; these row columns are nullable in reality.
  model?: string | null;
  provider?: string | null;
  title?: string | null;
};

interface RuntimeRequest {
  visibility?: 'private' | 'public';
}

const RuntimeChooser = ({
  visibility,
  onSelected,
}: RuntimeRequest & {
  onSelected: (config: AgentRuntimeConfig) => void;
}) => {
  const { t } = useTranslation(['chat', 'common']);
  const workspaceId = useActiveWorkspaceId();
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [bindings, setBindings] = useState<ProviderBinding[]>([]);
  const [imported, setImported] = useState<AgentRuntimeConfig[]>([]);
  const [hostId, setHostId] = useState('');
  const [bindingId, setBindingId] = useState('');
  const [runtime, setRuntime] = useState('prime');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const checkpoint = useRef<FirstAgentProviderCheckpoint>({});
  const saving = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setDevices([]);
    setBindings([]);
    setImported([]);
    setHostId('');
    try {
      const [deviceRows, providerRows, list] = await Promise.all([
        deviceService.listDevices(),
        providerBindingService.list(),
        homeService.getSidebarAgentList(),
      ]);
      const hosts = deviceRows.filter(
        (device) =>
          device.registered &&
          (!workspaceId
            ? device.scope === 'personal'
            : visibility === 'private'
              ? true
              : device.scope === 'workspace' && device.visibility === 'public'),
      );
      const providers = providerRows.data.filter(
        (binding) =>
          binding.enabled &&
          binding.selection.runtime === 'orvilo' &&
          binding.selection.target === 'sandbox' &&
          !!binding.model.trim() &&
          binding.model !== PROVIDER_CONFIG_ANCHOR_MODEL,
      );
      const rows = [
        ...list.pinned,
        ...list.ungrouped,
        ...list.groups.flatMap((group) => group.items),
        ...list.privatePinned,
        ...list.privateUngrouped,
        ...list.privateGroups.flatMap((group) => group.items),
      ];
      const configs = await Promise.all(
        [...new Set(rows.map((row) => row.id))].map((id) => agentService.getAgentConfigById(id)),
      );
      const runtimes: AgentRuntimeConfig[] = [];
      for (const config of configs) {
        const agency = config?.agencyConfig;
        const provider = agency?.heterogeneousProvider;
        if (
          !config ||
          !provider ||
          provider.type === 'orvilo' ||
          !hosts.some((host) => host.deviceId === agency?.boundDeviceId)
        )
          continue;
        // Copy only execution settings; credentials and Agent ownership never travel.
        const { env: _env, ...safeProvider } = provider;
        runtimes.push({
          agencyConfig: {
            boundDeviceId: agency?.boundDeviceId,
            executionTarget: agency?.executionTarget,
            heterogeneousProvider: safeProvider,
            workingDirByDevice: agency?.workingDirByDevice,
          },
          model: config.model,
          provider: config.provider,
          title: config.title,
        });
      }
      setDevices(hosts);
      setBindings(providers);
      setImported(runtimes);
      setHostId(hosts[0]?.deviceId ?? '');
      setBindingId(providers[0]?.id ?? '');
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, visibility]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (saving.current || loading) return;
    saving.current = true;
    setPending(true);
    setError(undefined);
    try {
      let config: AgentRuntimeConfig;
      if (runtime === 'prime') {
        if (!devices.some((device) => device.deviceId === hostId))
          throw new Error('FIRST_AGENT_DEVICE_REQUIRED');
        const binding = bindingId
          ? bindings.find((binding) => binding.id === bindingId)
          : await prepareFirstAgentProvider({ apiKey, endpoint, model }, checkpoint.current);
        if (!binding) throw new Error('EXECUTION_MODEL_REQUIRED');
        config = {
          ...firstPrimeAgentConfig(binding.model, hostId),
          provider: binding.provider,
          model: binding.model,
        };
      } else {
        const selected = imported[Number(runtime)];
        if (!selected) throw new Error('FIRST_AGENT_REQUIRED');
        config = selected;
      }
      setApiKey('');
      onSelected(config);
      close();
    } catch (cause) {
      setError(cause);
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm text-muted-foreground">{t('creation.runtime.description')}</p>
      <label className="flex flex-col gap-2 text-sm">
        {t('creation.runtime.label')}
        <Select
          disabled={loading || pending}
          value={runtime}
          onValueChange={(value) => setRuntime(value ?? 'prime')}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string) =>
                value === 'prime'
                  ? t('creation.runtime.prime')
                  : (imported[Number(value)]?.title ??
                    imported[Number(value)]?.agencyConfig?.heterogeneousProvider?.type ??
                    value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prime">{t('creation.runtime.prime')}</SelectItem>
            {imported.map((config, index) => (
              <SelectItem key={index} value={String(index)}>
                {config.title || config.agencyConfig?.heterogeneousProvider?.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {runtime === 'prime' && (
        <>
          <label className="flex flex-col gap-2 text-sm">
            {t('creation.runtime.host')}
            <Select
              required
              disabled={loading || pending}
              value={hostId || null}
              onValueChange={(value) => setHostId(value ?? '')}
            >
              <SelectTrigger className="w-full">
                {/* Render the device label, never the raw id: a value not yet
                    in the loaded list used to fall back to showing the UUID. */}
                <SelectValue placeholder={t('creation.runtime.hostEmpty')}>
                  {(value: string) => {
                    const device = devices.find((item) => item.deviceId === value);
                    return device ? getDeviceLabel(device, t('common:desktop')) : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {getDeviceLabel(device, t('common:desktop'))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {!loading && !devices.length && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t('creation.runtime.hostHelp')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  close();
                  navigate('/settings/devices');
                }}
              >
                {t('creation.runtime.devices')}
              </Button>
            </div>
          )}
          <label className="flex flex-col gap-2 text-sm">
            {t('creation.runtime.provider')}
            <Select
              disabled={loading || pending}
              value={bindingId || 'configure'}
              onValueChange={(value) => setBindingId(value === 'configure' ? '' : (value ?? ''))}
            >
              <SelectTrigger className="w-full">
                {/* Same fix as the host select: show "provider / model", never
                    the binding's UUID, when the select is closed. */}
                <SelectValue>
                  {(value: string) =>
                    value === 'configure'
                      ? t('onboarding.api.configure')
                      : (() => {
                          const binding = bindings.find((item) => item.id === value);
                          return binding ? `${binding.provider} / ${binding.model}` : value;
                        })()
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bindings.map((binding) => (
                  <SelectItem key={binding.id} value={binding.id}>
                    {binding.provider} / {binding.model}
                  </SelectItem>
                ))}
                <SelectItem value="configure">{t('onboarding.api.configure')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {!loading && !bindingId && (
            <ProviderSetupFields
              apiKey={apiKey}
              configDisabled={pending}
              endpoint={endpoint}
              keyDisabled={pending}
              model={model}
              onApiKeyChange={setApiKey}
              onEndpointChange={setEndpoint}
              onModelChange={setModel}
            />
          )}
        </>
      )}
      {error !== undefined && (
        <AsyncError
          error={error}
          retrying={loading || pending}
          onRetry={() => void (loading || !devices.length ? load() : submit())}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} type="button" variant="outline" onClick={close}>
          {t('common:cancel')}
        </Button>
        <Button
          disabled={loading || pending || (runtime === 'prime' && !hostId)}
          loading={loading || pending}
          type="submit"
        >
          {t('creation.runtime.use')}
        </Button>
      </div>
    </form>
  );
};

/** Resolve a runtime without creating an extra Agent, including for template callers. */
export const requestAgentRuntime = (
  options: RuntimeRequest = {},
): Promise<AgentRuntimeConfig | undefined> =>
  new Promise((resolve) => {
    createModal({
      content: <RuntimeChooser {...options} onSelected={resolve} />,
      footer: null,
      maskClosable: false,
      onOpenChangeComplete: (open) => {
        if (!open) resolve(undefined);
      },
      title: i18nT('creation.runtime.title', { ns: 'chat' }),
      width: 'min(92vw, 520px)',
    });
  });

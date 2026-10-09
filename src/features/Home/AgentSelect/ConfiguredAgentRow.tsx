import { CheckIcon, PinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Button } from '@/components/ui/button';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useDeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { useClientDataSWRWithSync } from '@/libs/swr';
import { agentConfigKeys } from '@/libs/swr/keys';
import { getHostContext } from '@/platform';
import { agentService } from '@/services/agent';
import { useAgentStore } from '@/store/agent';
import { useFetchProviderBindings } from '@/store/providerBinding';

import { agentReadiness } from './agentReadiness';
import type { AgentRow } from './useHomeAgentRows';

export const ConfiguredAgentRow = ({
  active,
  row,
  onConfigure,
  onSelect,
}: {
  active: boolean;
  row: AgentRow;
  onConfigure: (id: string) => void;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation('chat');
  const desktop = getHostContext().kind === 'desktop';
  // Hydrate the authoritative profile without adopting it as the active Agent.
  const profile = useClientDataSWRWithSync(
    agentConfigKeys.config(row.id),
    () => agentService.getAgentConfigById(row.id),
    {
      onData: (data) => {
        if (data)
          useAgentStore.setState((state) => ({
            agentMap: { ...state.agentMap, [row.id]: data },
          }));
      },
    },
  );
  const {
    agencyConfig,
    canSelectExecutionTarget,
    canSelectPersonalDevice,
    isPreferenceLoading,
    memberSelectedDeviceId,
    workspaceScoped,
  } = useEffectiveAgencyConfig(row.id);
  const workspaceId = useAgentStore((state) => state.agentMap[row.id]?.workspaceId);
  const devices = useDeviceList();
  const { selectableDevices } = useDeviceSelectorState({
    boundDeviceId: agencyConfig?.boundDeviceId,
    canSelectDevice: canSelectExecutionTarget,
    canSelectPersonalDevice,
    memberSelectedDeviceId,
    permissionsLoaded: !isPreferenceLoading,
    scope: workspaceId ? 'workspace' : 'personal',
  });
  const bindings = useFetchProviderBindings();
  const type = agencyConfig?.heterogeneousProvider?.type;
  const needsDevices =
    agencyConfig?.executionTarget === 'device' ||
    (agencyConfig?.executionTarget === 'local' && !desktop);
  const failed =
    profile.error || (needsDevices && devices.error) || (type === 'orvilo' && bindings.error);
  const loading =
    !failed &&
    (profile.isLoading ||
      profile.data === undefined ||
      (!!profile.data &&
        (isPreferenceLoading ||
          (needsDevices && !devices.data) ||
          (type === 'orvilo' && !bindings.data))));
  const status = failed
    ? 'loadFailed'
    : loading
      ? 'loading'
      : agentReadiness(
          profile.data ? agencyConfig : undefined,
          selectableDevices,
          bindings.data?.data ?? [],
          desktop,
          workspaceScoped,
        );
  const ready = status === 'ready';

  return (
    <div className="flex items-center gap-1 rounded-md hover:bg-accent">
      <Button
        aria-pressed={active}
        className="h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5 text-left"
        disabled={!ready}
        variant="ghost"
        onClick={() => onSelect(row.id)}
      >
        <AgentRuntimeIcon size={24} type={type || row.heterogeneousType || 'orvilo'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{row.title}</span>
          {!ready && (
            <span className="block text-xs text-muted-foreground">
              {t(`agentPicker.status.${status}`)}
            </span>
          )}
        </span>
        {row.pinned && <PinIcon aria-hidden size={12} />}
        {active && <CheckIcon aria-hidden className="shrink-0 text-primary" size={16} />}
      </Button>
      {!ready && !loading && (
        <Button size="xs" variant="ghost" onClick={() => onConfigure(row.id)}>
          {t('agentPicker.configure')}
        </Button>
      )}
    </div>
  );
};

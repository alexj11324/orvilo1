'use client';

import { isDesktop } from '@orvilo/const';
import {
  HETEROGENEOUS_TYPE_LABELS,
  isHeterogeneousProviderBindingSupported,
  isRemoteHeterogeneousType,
  isServerDefaultHeterogeneousAgentType,
  type RemoteHeterogeneousAgentType,
} from '@orvilo/heterogeneous-agents';
import type { HeterogeneousApiConfig, HeterogeneousAuthMode } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { CableIcon, CheckCircle2, MonitorSmartphone, RefreshCw, XCircle } from 'lucide-react';
import { memo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { resolveServerDefaultAgentModels } from '@/features/HeterogeneousAgent/modelPicker';
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { usePermission } from '@/hooks/usePermission';
import { deviceService } from '@/services/device';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import CloudHeterogeneousConfig from './CloudHeterogeneousConfig';
import HeterogeneousAgentStatusCard from './HeterogeneousAgentStatusCard';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

/**
 * Remote platform agents (openclaw / hermes): the platform + availability
 * facts. The bound-device row and change-device modal are gone — the shared
 * Device group owns the only device picker, per the execution contract.
 */
const RemoteConnectionRows = memo<{ agentId: string; platform: RemoteHeterogeneousAgentType }>(
  ({ agentId, platform }) => {
    const { t } = useTranslation('setting');
    const boundDeviceId = useAgentStore((s) =>
      agentId ? s.agentMap[agentId]?.agencyConfig?.boundDeviceId : undefined,
    );
    const { data: devices } = useDeviceList();
    const boundDevice = devices?.find((d) => d.deviceId === boundDeviceId);

    const [capabilityResult, setCapabilityResult] = useState<
      { available: boolean; reason?: string; version?: string } | undefined
    >(undefined);
    const [checkingCapability, setCheckingCapability] = useState(false);

    const checkCapability = useCallback(
      async (deviceId: string) => {
        setCheckingCapability(true);
        setCapabilityResult(undefined);
        try {
          const result = await deviceService.checkCapability({ deviceId, platform });
          setCapabilityResult(result);
        } catch {
          setCapabilityResult({ available: false, reason: 'Check failed' });
        } finally {
          setCheckingCapability(false);
        }
      },
      [platform],
    );

    useEffect(() => {
      if (boundDeviceId && boundDevice?.online) {
        void checkCapability(boundDeviceId);
      }
    }, [boundDeviceId, boundDevice?.online, checkCapability]);

    const renderAvailability = () => {
      if (!boundDeviceId) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
            {t('platformAgentConfig.availability.noDevice')}
          </Badge>
        );
      }
      if (!boundDevice?.online) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="warning-light">
            {t('platformAgentConfig.device.offline')}
          </Badge>
        );
      }
      if (checkingCapability) {
        return (
          <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
            {t('platformAgentConfig.availability.checking')}
          </Badge>
        );
      }
      if (!capabilityResult) return null;
      if (capabilityResult.available) {
        return (
          <div className="flex items-center gap-1">
            <CheckCircle2 color="var(--ant-color-success)" size={14} />
            <Badge style={{ marginInlineEnd: 0 }} variant="success-light">
              {capabilityResult.version ?? t('platformAgentConfig.availability.available')}
            </Badge>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <XCircle color="var(--ant-color-error)" size={14} />
          <Badge style={{ marginInlineEnd: 0 }} variant="destructive-light">
            {t('platformAgentConfig.availability.notInstalled')}
          </Badge>
        </div>
      );
    };

    return (
      <>
        <SettingsRow label={t('platformAgentConfig.platform.label')}>
          <div className="flex items-center justify-between w-full">
            <Badge style={{ marginInlineEnd: 0 }} variant="primary-light">
              {HETEROGENEOUS_TYPE_LABELS[platform] ?? platform}
            </Badge>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <ActionIcon
                        aria-label={t('platformAgentConfig.redetect')}
                        disabled={!boundDeviceId || checkingCapability}
                        icon={RefreshCw}
                        loading={checkingCapability}
                        size="small"
                        onClick={() => boundDeviceId && void checkCapability(boundDeviceId)}
                      />
                    </span>
                  }
                />
                <TooltipContent>{t('platformAgentConfig.redetect')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </SettingsRow>
        <SettingsRow label={t('platformAgentConfig.availability.label')}>
          {renderAvailability()}
        </SettingsRow>
      </>
    );
  },
);

RemoteConnectionRows.displayName = 'ExternalAgentConnectionSettings.RemoteConnectionRows';

/**
 * Local-CLI external agents: the Cloud/Desktop connection tabs (command, env,
 * auth, API config) — the content the retired engine card's sibling tabs held.
 */
const LocalCliConnectionRows = memo<{ agentId: string }>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
  const isWorkspaceAgent = Boolean(useAgentStore((s) => s.agentMap[agentId]?.workspaceId));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const heterogeneousProvider = config?.agencyConfig?.heterogeneousProvider;
  const { agencyConfig: effectiveAgencyConfig, workspaceScoped } =
    useEffectiveAgencyConfig(agentId);

  const updateHeterogeneousCommand = async (command: string) => {
    if (!canEdit || !heterogeneousProvider) return;
    await updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...heterogeneousProvider, command } },
    });
  };
  const updateHeterogeneousEnv = async (env: Record<string, string>) => {
    if (!canEdit || !heterogeneousProvider) return;
    await updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...heterogeneousProvider, env } },
    });
  };
  const updateHeterogeneousAuthMode = async (
    authMode: HeterogeneousAuthMode,
    apiConfig?: HeterogeneousApiConfig,
  ) => {
    if (!canEdit || !heterogeneousProvider) return;
    await updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...heterogeneousProvider, apiConfig, authMode } },
    });
  };
  const updateHeterogeneousApiConfig = async (apiConfig: HeterogeneousApiConfig | undefined) => {
    if (!canEdit || !heterogeneousProvider) return;
    await updateAgentConfigById(agentId, {
      agencyConfig: { heterogeneousProvider: { ...heterogeneousProvider, apiConfig } },
    });
  };

  const showCloudHeterogeneousTab = heterogeneousProvider?.type === 'claude-code';
  const localDesktopAvailable =
    isDesktop &&
    !!heterogeneousProvider &&
    isHeterogeneousProviderBindingSupported(heterogeneousProvider.type) &&
    resolveExecutionTarget(effectiveAgencyConfig, {
      clientExecutionAvailable: true,
      isHetero: true,
      workspaceScoped,
    }) === 'local';
  const apiModeAvailable = localDesktopAvailable && !isWorkspaceAgent;
  const useFetchServerDefaultCapability = useAgentStore(
    (s) => s.useFetchServerDefaultHeterogeneousCapability,
  );
  const serverDefaultAgentType =
    heterogeneousProvider && isServerDefaultHeterogeneousAgentType(heterogeneousProvider.type)
      ? heterogeneousProvider.type
      : undefined;
  const serverCapabilityEnabled = localDesktopAvailable && !!serverDefaultAgentType;
  const serverCapability = useFetchServerDefaultCapability(serverCapabilityEnabled);
  const serverDefaultModels =
    serverCapability.data?.enabled === true && serverDefaultAgentType
      ? resolveServerDefaultAgentModels(serverCapability.data.models, serverDefaultAgentType)
      : [];
  const serverDefaultAvailable = serverCapabilityEnabled && serverDefaultModels.length > 0;
  const serverDefaultUnavailableReason = !localDesktopAvailable
    ? t('heterogeneousStatus.apiMode.localOnly')
    : serverCapability.error
      ? t('heterogeneousStatus.apiMode.serverDefault.loadFailed')
      : serverCapability.data?.enabled === false
        ? t(
            serverCapability.data.reason === 'disabled'
              ? 'heterogeneousStatus.apiMode.serverDefault.disabled'
              : 'heterogeneousStatus.apiMode.serverDefault.invalidConfiguration',
          )
        : serverCapabilityEnabled && !serverCapability.isLoading && !serverDefaultAvailable
          ? t('heterogeneousStatus.apiMode.serverDefault.unsupported')
          : undefined;

  const tabItems: { children: ReactNode; disabled?: boolean; key: string; label: ReactNode }[] =
    heterogeneousProvider
      ? [
          ...(showCloudHeterogeneousTab
            ? [
                {
                  key: 'cloud',
                  label: t('heterogeneousStatus.cloud.tabLabel'),
                  children: (
                    <CloudHeterogeneousConfig
                      provider={heterogeneousProvider}
                      onEnvChange={updateHeterogeneousEnv}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'desktop',
            label: t('heterogeneousStatus.desktop.tabLabel'),
            disabled: !isDesktop,
            children: (
              <HeterogeneousAgentStatusCard
                apiModeAvailable={apiModeAvailable}
                apiModeWorkspaceBlocked={isWorkspaceAgent}
                provider={heterogeneousProvider}
                serverDefaultAvailable={serverDefaultAvailable}
                serverDefaultLoading={serverCapabilityEnabled && serverCapability.isLoading}
                serverDefaultModels={serverDefaultModels}
                serverDefaultUnavailableReason={serverDefaultUnavailableReason}
                onApiConfigChange={updateHeterogeneousApiConfig}
                onAuthModeChange={updateHeterogeneousAuthMode}
                onCommandChange={updateHeterogeneousCommand}
                onServerDefaultRetry={() => {
                  void serverCapability.mutate();
                }}
              />
            ),
          },
        ]
      : [];

  return (
    <SettingsRow>
      <Tabs defaultValue={isDesktop || !showCloudHeterogeneousTab ? 'desktop' : 'cloud'}>
        <TabsList>
          {tabItems.map((item) => (
            <TabsTrigger disabled={item.disabled} key={item.key} value={item.key}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabItems.map((item) => (
          <TabsContent key={item.key} value={item.key}>
            {item.children}
          </TabsContent>
        ))}
      </Tabs>
    </SettingsRow>
  );
});

LocalCliConnectionRows.displayName = 'ExternalAgentConnectionSettings.LocalCliConnectionRows';

interface ExternalAgentConnectionSettingsProps {
  agentId: string;
}

/**
 * The external agent's Connection settings group — the transport facts and
 * knobs for a non-builtin harness (platform identity, availability, command /
 * env / auth). External agents only; the Device group renders separately and
 * owns the only device picker.
 */
const ExternalAgentConnectionSettings = memo<ExternalAgentConnectionSettingsProps>(
  ({ agentId }) => {
    const { t } = useTranslation('setting');
    const config = useAgentStore(agentSelectors.getAgentConfigById(agentId), isEqual);
    const provider = config?.agencyConfig?.heterogeneousProvider;

    if (!provider) return null;

    const remote = isRemoteHeterogeneousType(provider.type);

    return (
      <SettingsGroup
        icon={remote ? MonitorSmartphone : CableIcon}
        title={t('platformAgentConfig.title')}
      >
        {remote ? (
          <RemoteConnectionRows
            agentId={agentId}
            platform={provider.type as RemoteHeterogeneousAgentType}
          />
        ) : (
          <LocalCliConnectionRows agentId={agentId} />
        )}
      </SettingsGroup>
    );
  },
);

ExternalAgentConnectionSettings.displayName = 'ExternalAgentConnectionSettings';

export default ExternalAgentConnectionSettings;

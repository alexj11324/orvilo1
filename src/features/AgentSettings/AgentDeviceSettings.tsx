'use client';

import { isDesktop } from '@orvilo/const';
import type { AgentModelSelectionPolicy, DeviceListItem } from '@orvilo/types';
import { LockIcon, TriangleAlertIcon, UsersIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Badge } from '@/components/reui/badge';
import type { SelectOptions } from '@/components/SelectOptions';
import { selectItems, SelectOptionItems } from '@/components/SelectOptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useDeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';
import {
  ExecutionTargetDeviceStatus,
  ExecutionTargetIcon,
  executionTargetValue,
  parseExecutionTargetValue,
  resolveExecutionTargetSelection,
} from '@/features/ExecutionTargetPicker';
import { isBuiltinEngineType } from '@/features/HeterogeneousAgent/engine';
import PolicySelect, { type PolicyOption } from '@/features/ResourcePermission/PolicySelect';
import { getSelectionPolicyLabelKeys } from '@/features/ResourcePermission/selectionPolicyLabels';
import { useAgentSelectionPolicies } from '@/features/ResourcePermission/useAgentSelectionPolicies';
import { isHeterogeneousSandboxExecutionAvailable } from '@/helpers/executionTarget';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { usePermission } from '@/hooks/usePermission';
import { useSelectAgentDevice } from '@/hooks/useSelectAgentDevice';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, agentSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import { resolveAgentDeviceSettingsState } from './agentDeviceSettingsState';
import { SettingsGroup, SettingsRow, settingsStyles } from './SettingsGroup';

const DeviceOptionLabel = memo<{
  device?: { online: boolean; platform?: string | null };
  label: string;
  offlineLabel: string;
  onlineLabel: string;
  target: 'device' | 'local' | 'sandbox';
}>(({ device, label, offlineLabel, onlineLabel, target }) => (
  <span className="flex items-center gap-2 min-w-0">
    <span aria-hidden className="flex items-center justify-center w-4 flex-none">
      <ExecutionTargetIcon devicePlatform={device?.platform} target={target} />
    </span>
    <span className="truncate">{label}</span>
    {device ? (
      <ExecutionTargetDeviceStatus
        offlineLabel={offlineLabel}
        online={device.online}
        onlineLabel={onlineLabel}
      />
    ) : null}
  </span>
));

DeviceOptionLabel.displayName = 'AgentDeviceSettings.DeviceOptionLabel';

interface AgentDeviceSettingsProps {
  agentId: string;
}

/**
 * The agent's Device settings group — THE single device component.
 * Per docs/development/device-execution-contract.md:
 * - >1 legal devices + permission → the picker renders (offline devices stay
 *   visible as candidates).
 * - 0 legal devices → hidden + a blocking notice (never an arbitrary backend).
 * - 1 device → hidden; admission resolves it (never a render-time write).
 * - Stale binding → DEVICE_BINDING_INVALID repair prompt, never silent rebind.
 * - Policy-fixed / no permission → non-editable display.
 * - Loading / query failure is never 0 or 1.
 */
const AgentDeviceSettings = memo<AgentDeviceSettingsProps>(({ agentId }) => {
  const { t } = useTranslation(['setting', 'chat']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const {
    agencyConfig,
    canSelectExecutionTarget,
    canSelectPersonalDevice,
    isPreferenceLoading,
    memberSelectedDeviceId,
  } = useEffectiveAgencyConfig(agentId);
  const selectAgentDevice = useSelectAgentDevice(agentId);
  const { mutate: retryDevices } = useDeviceList();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);

  const isWorkspaceAgent = Boolean(agent?.workspaceId);
  const {
    canEditPolicies,
    canFixExecutionTarget,
    executionTargetPolicy,
    setExecutionTargetPolicy,
  } = useAgentSelectionPolicies(agentId);
  const isPrivate = agent?.visibility === 'private';
  const labelKeys = getSelectionPolicyLabelKeys(isPrivate);
  const devicePolicyOptions = useMemo(
    (): PolicyOption<AgentModelSelectionPolicy>[] => [
      {
        desc: t('permission.page.devicePolicyMemberDesc'),
        icon: UsersIcon,
        label: t(labelKeys.member),
        value: 'member',
      },
      canFixExecutionTarget
        ? {
            desc: t('permission.page.devicePolicyFixedDesc'),
            icon: LockIcon,
            label: t(labelKeys.fixed),
            value: 'fixed',
          }
        : {
            desc: t('permission.page.devicePolicyUnset'),
            disabled: true,
            icon: LockIcon,
            label: t(labelKeys.fixed),
            value: 'fixed',
          },
    ],
    [canFixExecutionTarget, labelKeys, t],
  );
  const heterogeneousType = config?.agencyConfig?.heterogeneousProvider?.type;
  const externalHarness = !!heterogeneousType && !isBuiltinEngineType(heterogeneousType);
  const enableCloudSandbox = useServerConfigStore(
    (s) => featureFlagsSelectors(s).enableCloudSandbox === true,
  );
  const supportsSandbox =
    enableCloudSandbox && isHeterogeneousSandboxExecutionAvailable(heterogeneousType);

  // A workspace member's device pick is their own preference write — the
  // shared `edit_own_content` gate applies to personal agents only.
  const canSelectDevice = canSelectExecutionTarget && (isWorkspaceAgent || canEdit);

  const state = useDeviceSelectorState({
    boundDeviceId: agencyConfig?.boundDeviceId,
    canSelectDevice,
    canSelectPersonalDevice,
    memberSelectedDeviceId,
    permissionsLoaded: !isPreferenceLoading,
    scope: isWorkspaceAgent ? 'workspace' : 'personal',
  });
  const {
    bindingState,
    deviceInventoryComplete,
    deviceInventoryError,
    selectableDevices,
    showDeviceSelector,
  } = state;

  const boundDevice = useMemo(
    () => selectableDevices.find((d) => d.deviceId === agencyConfig?.boundDeviceId),
    [agencyConfig?.boundDeviceId, selectableDevices],
  );

  const sharedTargets = useMemo<SelectOptions>(() => {
    if (!externalHarness) return [];
    const offlineLabel = t('chat:heteroAgent.executionTarget.offline');
    const onlineLabel = t('chat:heteroAgent.executionTarget.online');
    return [
      ...(isDesktop
        ? [
            {
              label: (
                <DeviceOptionLabel
                  label={t('chat:heteroAgent.executionTarget.local')}
                  offlineLabel={offlineLabel}
                  onlineLabel={onlineLabel}
                  target={'local'}
                />
              ),
              title: t('chat:heteroAgent.executionTarget.local'),
              value: executionTargetValue('local'),
            },
          ]
        : []),
      ...(supportsSandbox
        ? [
            {
              label: (
                <DeviceOptionLabel
                  label={t('chat:heteroAgent.executionTarget.sandbox')}
                  offlineLabel={offlineLabel}
                  onlineLabel={onlineLabel}
                  target={'sandbox'}
                />
              ),
              title: t('chat:heteroAgent.executionTarget.sandbox'),
              value: executionTargetValue('sandbox'),
            },
          ]
        : []),
    ];
  }, [externalHarness, supportsSandbox, t]);

  const deviceOptions = useMemo<SelectOptions>(() => {
    const offlineLabel = t('chat:heteroAgent.executionTarget.offline');
    const onlineLabel = t('chat:heteroAgent.executionTarget.online');
    const thisMachineLabel = t('devices.currentBadge');
    return selectableDevices.map((device: DeviceListItem) => {
      const isThisMachine = device.deviceId === currentDeviceId;
      const name = device.friendlyName || device.hostname || device.deviceId;
      return {
        label: (
          <DeviceOptionLabel
            device={device}
            label={isThisMachine ? `${name} · ${thisMachineLabel}` : name}
            offlineLabel={offlineLabel}
            onlineLabel={onlineLabel}
            target={'device'}
          />
        ),
        title: name,
        value: executionTargetValue('device', device.deviceId),
      };
    });
  }, [currentDeviceId, selectableDevices, t]);

  const selected = resolveExecutionTargetSelection({
    boundDeviceId: agencyConfig?.boundDeviceId,
    configuredTarget: agencyConfig?.executionTarget,
    devices: selectableDevices,
    isHeterogeneous: true,
  });
  const selectedValue = selected
    ? executionTargetValue(selected.target, selected.deviceId)
    : undefined;

  const handleChange = (value: string) => {
    const selection = parseExecutionTargetValue(value);
    if (!selection) return;
    void selectAgentDevice({
      boundDeviceId:
        selection.deviceId ?? (selection.target === 'local' ? currentDeviceId : undefined),
      executionTarget: selection.target,
    });
  };

  const repairWith = (device: DeviceListItem) => {
    void selectAgentDevice({ boundDeviceId: device.deviceId, executionTarget: 'device' });
  };

  const { showOfflineNotice, showReadOnlyBinding, showRepairPrompt, showZeroDeviceNotice } =
    resolveAgentDeviceSettingsState({
      bindingState,
      boundDevice,
      canSelectDevice,
      deviceInventoryComplete,
      isPreferenceLoading,
      selectableDeviceCount: selectableDevices.length,
    });

  return (
    <SettingsGroup title={t('settingAgent.executionSettings.title')}>
      {deviceInventoryError ? (
        <SettingsRow>
          <AsyncError
            error={deviceInventoryError}
            variant={'inline'}
            onRetry={() => void retryDevices()}
          />
        </SettingsRow>
      ) : null}

      {showDeviceSelector ? (
        <SettingsRow label={t('settingAgent.deviceSettings.deviceLabel')}>
          <Select
            items={selectItems([...sharedTargets, ...deviceOptions])}
            value={selectedValue}
            onValueChange={(value) => {
              if (typeof value === 'string') handleChange(value);
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue placeholder={t('settingAgent.devicePolicy.selectTarget')} />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={[...sharedTargets, ...deviceOptions]} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}

      {showReadOnlyBinding ? (
        <SettingsRow label={t('settingAgent.deviceSettings.deviceLabel')}>
          {boundDevice ? (
            <div className="flex items-center gap-2">
              <span className="truncate">{boundDevice.friendlyName || boundDevice.hostname}</span>
              <Badge
                color={boundDevice.online ? 'success' : 'default'}
                style={{ marginInlineEnd: 0 }}
                variant="primary-light"
              >
                {boundDevice.online
                  ? t('chat:heteroAgent.executionTarget.online')
                  : t('chat:heteroAgent.executionTarget.offline')}
              </Badge>
            </div>
          ) : (
            <div className={settingsStyles.hint}>
              {t('settingAgent.deviceSettings.bindingMissing')}
            </div>
          )}
        </SettingsRow>
      ) : null}

      {showRepairPrompt ? (
        <SettingsRow>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('settingAgent.deviceSettings.bindingInvalidTitle')}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-col gap-2">
                <span>{t('settingAgent.deviceSettings.bindingInvalidDesc')}</span>
                <div className="flex flex-wrap gap-2">
                  {selectableDevices.map((device) => (
                    <Button
                      disabled={!canSelectDevice}
                      key={device.deviceId}
                      size="sm"
                      variant="outline"
                      onClick={() => repairWith(device)}
                    >
                      {t('settingAgent.deviceSettings.bindingRepair', {
                        name: device.friendlyName || device.hostname || device.deviceId,
                      })}
                    </Button>
                  ))}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </SettingsRow>
      ) : null}

      {showZeroDeviceNotice ? (
        <SettingsRow>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('settingAgent.deviceSettings.zeroDeviceTitle')}</AlertTitle>
            <AlertDescription>{t('settingAgent.deviceSettings.zeroDeviceDesc')}</AlertDescription>
          </Alert>
        </SettingsRow>
      ) : null}

      {showOfflineNotice ? (
        <SettingsRow>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('settingAgent.deviceSettings.offlineBoundTitle')}</AlertTitle>
            <AlertDescription>{t('settingAgent.deviceSettings.offlineBoundDesc')}</AlertDescription>
          </Alert>
        </SettingsRow>
      ) : null}

      {isWorkspaceAgent ? (
        <SettingsRow label={t('settingAgent.devicePolicy.title')}>
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2">
              <UsersIcon size={16} />
              <PolicySelect
                disabled={!canEditPolicies}
                options={devicePolicyOptions}
                value={executionTargetPolicy}
                onChange={setExecutionTargetPolicy}
              />
            </div>
            <div className={settingsStyles.hint}>
              {canEditPolicies
                ? t('permission.page.devicePolicyDesc')
                : t('permission.noManagePermission')}
            </div>
          </div>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
});

AgentDeviceSettings.displayName = 'AgentDeviceSettings';

export default AgentDeviceSettings;

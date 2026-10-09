'use client';

import type { DeviceListItem } from '@orvilo/types';
import { TriangleAlertIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Badge } from '@/components/reui/badge';
import type { SelectOptions } from '@/components/SelectOptions';
import { selectItems, SelectOptionItems } from '@/components/SelectOptions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeviceSelectorState } from '@/features/DeviceManager/useDeviceSelectorState';
import {
  ExecutionTargetDeviceStatus,
  ExecutionTargetIcon,
  executionTargetValue,
  parseExecutionTargetValue,
  resolveExecutionTargetSelection,
} from '@/features/ExecutionTargetPicker';
import { useEffectiveAgencyConfig } from '@/hooks/useEffectiveAgencyConfig';
import { usePermission } from '@/hooks/usePermission';
import { useSelectAgentDevice } from '@/hooks/useSelectAgentDevice';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useElectronStore } from '@/store/electron';

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
  const {
    agencyConfig,
    canSelectExecutionTarget,
    canSelectPersonalDevice,
    isPreferenceLoading,
    memberSelectedDeviceId,
  } = useEffectiveAgencyConfig(agentId);
  const selectAgentDevice = useSelectAgentDevice(agentId);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);

  const isWorkspaceAgent = Boolean(agent?.workspaceId);

  // A workspace member's device pick is their own preference write — the
  // shared `edit_own_content` gate applies to personal agents only.
  const canSelectDevice = canSelectExecutionTarget && (isWorkspaceAgent || canEdit);

  const state = useDeviceSelectorState({
    agentId,
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
    refreshDevices: retryDevices,
    runtimeInventoryUnverified,
    runtimeInventoryOfflineOnly,
  } = state;

  const boundDevice = useMemo(
    () => selectableDevices.find((d) => d.deviceId === agencyConfig?.boundDeviceId),
    [agencyConfig?.boundDeviceId, selectableDevices],
  );

  const deviceOptions = useMemo<SelectOptions>(() => {
    const offlineLabel = t('chat:heteroAgent.executionTarget.offline');
    const onlineLabel = t('chat:heteroAgent.executionTarget.online');
    const thisMachineLabel = t('devices.currentBadge');
    return selectableDevices.map((device: DeviceListItem) => {
      const isThisMachine = device.deviceId === currentDeviceId;
      const name = device.friendlyName || device.hostname || device.deviceId;
      return {
        disabled: !device.online,
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
  const selectedDeviceId =
    selected?.target === 'local'
      ? agencyConfig?.executionTargetSelectionPolicy === 'fixed'
        ? agencyConfig.boundDeviceId
        : (currentDeviceId ?? agencyConfig?.boundDeviceId)
      : selected?.deviceId;
  const selectedValue = selectableDevices.some((device) => device.deviceId === selectedDeviceId)
    ? executionTargetValue('device', selectedDeviceId)
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

  const {
    showDeviceGroup,
    showOfflineNotice,
    showReadOnlyBinding,
    showRepairPrompt,
    showZeroDeviceNotice,
  } = resolveAgentDeviceSettingsState({
    bindingState,
    runtimeInventoryOfflineOnly,
    explicitLocalDeviceIsEligible:
      agencyConfig?.executionTarget === 'local' &&
      selectableDevices.some((device) => device.deviceId === selectedDeviceId),
    boundDevice,
    canSelectDevice,
    deviceInventoryComplete,
    isPreferenceLoading,
    selectableDeviceCount: selectableDevices.length,
  });

  if (!showDeviceGroup) return null;

  return (
    <SettingsGroup title={t('settingAgent.execution.target')}>
      {(!deviceInventoryComplete && !deviceInventoryError) || isPreferenceLoading ? (
        <SettingsRow>
          <span className={settingsStyles.hint}>{t('settingAgent.list.loading')}</span>
        </SettingsRow>
      ) : null}
      {deviceInventoryError ? (
        <SettingsRow>
          <AsyncError
            error={deviceInventoryError}
            variant={'inline'}
            description={
              runtimeInventoryUnverified
                ? t('settingAgent.deviceSettings.runtimeUnverifiedDesc')
                : undefined
            }
            title={
              runtimeInventoryUnverified
                ? t('settingAgent.deviceSettings.runtimeUnverifiedTitle')
                : undefined
            }
            onRetry={() => void retryDevices()}
          />
        </SettingsRow>
      ) : null}

      {showDeviceSelector ? (
        <SettingsRow label={t('settingAgent.deviceSettings.deviceLabel')}>
          <Select
            items={selectItems(deviceOptions)}
            value={selectedValue}
            onValueChange={(value) => {
              if (typeof value === 'string') handleChange(value);
            }}
          >
            <SelectTrigger className={settingsStyles.select}>
              <SelectValue placeholder={t('settingAgent.devicePolicy.selectTarget')} />
            </SelectTrigger>
            <SelectContent>
              <SelectOptionItems options={deviceOptions} />
            </SelectContent>
          </Select>
        </SettingsRow>
      ) : null}

      {showReadOnlyBinding ||
      (!showDeviceSelector && selected && deviceInventoryComplete && !isPreferenceLoading) ? (
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
              {selected?.target === 'local'
                ? t('chat:heteroAgent.executionTarget.local')
                : selected?.target === 'sandbox'
                  ? t('chat:heteroAgent.executionTarget.sandbox')
                  : t('settingAgent.deviceSettings.bindingMissing')}
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
                      disabled={!canSelectDevice || !device.online}
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
    </SettingsGroup>
  );
});

AgentDeviceSettings.displayName = 'AgentDeviceSettings';

export default AgentDeviceSettings;

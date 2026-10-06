'use client';

import { BUILTIN_HETEROGENEOUS_AGENT_CONFIGS, HETEROGENEOUS_AGENT_CONFIGS } from '@orvilo/types';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import type { AgentRuntimeConfig } from '@/features/CreateAgent';
import { modelDisplayLabel } from '@/features/CreateAgent/agentOptions';
import { getDeviceLabel } from '@/features/DeviceManager/getDeviceLabel';
import { deviceService } from '@/services/device';

export const CoordinatorSummary = ({ config }: { config?: AgentRuntimeConfig }) => {
  const { t } = useTranslation('chat');
  const runtimeProvider = config?.agencyConfig?.heterogeneousProvider;
  const engine =
    [...HETEROGENEOUS_AGENT_CONFIGS, ...BUILTIN_HETEROGENEOUS_AGENT_CONFIGS].find(
      (item) => item.type === runtimeProvider?.type,
    )?.title ?? runtimeProvider?.type;
  const model =
    runtimeProvider?.type === 'orvilo'
      ? (config?.model ?? runtimeProvider.model)
      : (runtimeProvider?.model ?? config?.model);
  const deviceId = config?.agencyConfig?.boundDeviceId;
  const { data, isLoading, error } = useSWR(deviceId ? 'group-coordinator-devices' : null, () =>
    deviceService.listDevices(),
  );
  const device = data?.find((item) => item.deviceId === deviceId);
  const target = !config
    ? t('group.create.notConfigured')
    : deviceId
      ? isLoading
        ? t('group.create.detectingDevice')
        : device?.friendlyName || device?.hostname
          ? getDeviceLabel(device, t('group.settings.desktop'))
          : t('group.settings.deviceUnavailable')
      : config.agencyConfig?.executionTarget === 'local'
        ? t('group.settings.thisDevice')
        : t('group.create.notConfigured');
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">
        {config?.title?.trim() || t('group.settings.coordinatorName')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('group.create.coordinatorDescription')}</p>
      <p className="mt-2 text-sm">
        {t('group.settings.engine')}: {engine ?? t('group.create.notConfigured')}
      </p>
      <p className="text-sm">
        {t('group.settings.model')}:{' '}
        {model ? modelDisplayLabel({ id: model, modelId: model }) : t('group.create.notConfigured')}
      </p>
      <p className="text-sm">
        {t('group.settings.device')}: {error ? t('group.settings.deviceUnavailable') : target}
        {device && ` · ${t(device.online ? 'group.settings.online' : 'group.settings.offline')}`}
      </p>
    </div>
  );
};

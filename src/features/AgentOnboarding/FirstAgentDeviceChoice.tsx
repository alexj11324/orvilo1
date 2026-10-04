import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { DeviceConnectModal, useDeviceList } from '@/features/DeviceManager';
import { getDeviceLabel } from '@/features/DeviceManager/getDeviceLabel';

export default function FirstAgentDeviceChoice({
  deviceId,
  onSelect,
}: {
  deviceId?: string;
  onSelect: (deviceId: string) => void;
}) {
  const { t } = useTranslation('chat');
  const { data, error, mutate, isValidating } = useDeviceList();
  const [connectOpen, setConnectOpen] = useState(false);
  const devices = (data ?? []).filter((device) => device.scope === 'personal' && device.online);
  const name = (device: (typeof devices)[number]) =>
    getDeviceLabel(device, t('connectAgent.create.desktopChannel'));
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="font-medium">{t('onboarding.device.title')}</div>
      <p className="text-sm text-muted-foreground">{t('onboarding.device.description')}</p>
      {error ? (
        <AsyncError error={error} retrying={isValidating} onRetry={() => void mutate()} />
      ) : data === undefined ? (
        <Spinner />
      ) : devices.length === 0 ? (
        <p className="text-sm">{t('onboarding.device.empty')}</p>
      ) : devices.length === 1 ? (
        <Button
          variant={deviceId === devices[0].deviceId ? 'default' : 'outline'}
          onClick={() => onSelect(devices[0].deviceId)}
        >
          {t('onboarding.device.use', { name: name(devices[0]) })}
        </Button>
      ) : (
        <Select
          items={devices.map((device) => ({ value: device.deviceId, label: name(device) }))}
          value={deviceId ?? null}
          onValueChange={(value) => {
            if (value) onSelect(value);
          }}
        >
          <SelectTrigger aria-label={t('onboarding.device.title')}>
            <SelectValue placeholder={t('onboarding.device.title')} />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {name(device)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setConnectOpen(true)}>
          {t('onboarding.device.connect')}
        </Button>
        <Button disabled={isValidating} size="sm" variant="ghost" onClick={() => void mutate()}>
          {t('onboarding.rescan')}
        </Button>
      </div>
      <DeviceConnectModal
        open={connectOpen}
        scope="personal"
        onClose={() => {
          setConnectOpen(false);
          void mutate();
        }}
      />
    </div>
  );
}

'use client';

import type { DeviceListItem } from '@orvilo/types';
import { useEffect, useState } from 'react';

import { useDeviceList } from '@/features/DeviceManager';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';

export const eligibleExecutionDevices = (devices: DeviceListItem[]) =>
  devices.filter((device) => device.registered && device.online);

export const useExecutionHost = () => {
  const { data: devices, error, mutate } = useDeviceList();
  const [localDeviceId, setLocalDeviceId] = useState<string>();
  const [identityChecked, setIdentityChecked] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [identityAttempt, setIdentityAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setIdentityChecked(false);
    void resolveLocalExecutionIdentity().then((identity) => {
      if (!active) return;
      setLocalDeviceId(identity.localDeviceId);
      setIdentityChecked(true);
    });
    return () => {
      active = false;
    };
  }, [identityAttempt]);
  const pickable = eligibleExecutionDevices(devices ?? []);
  const localId = localDeviceId;
  const deviceId = selectedId ?? localId ?? pickable[0]?.deviceId;
  const isLocal = !!deviceId && deviceId === localId;
  const device = pickable.find((row) => row.deviceId === deviceId);
  const resolved = identityChecked && (!!localId || devices !== undefined || !!error);
  return {
    device,
    deviceId: resolved && (isLocal || device) ? deviceId : undefined,
    devices: pickable,
    error,
    exhausted: resolved && !localId && !pickable.length && !error,
    isLocal,
    loading: !resolved,
    localDeviceId: localId,
    retry: async () => {
      setIdentityAttempt((value) => value + 1);
      return mutate();
    },
    select: setSelectedId,
  };
};

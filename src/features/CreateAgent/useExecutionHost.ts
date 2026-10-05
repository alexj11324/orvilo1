'use client';

import type { DeviceListItem } from '@orvilo/types';
import { useEffect, useState } from 'react';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useDeviceList } from '@/features/DeviceManager';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';

export const eligibleExecutionDevices = (
  devices: DeviceListItem[],
  workspaceId?: string,
  visibility?: 'private' | 'public',
) =>
  devices.filter(
    (device) =>
      device.registered &&
      device.online &&
      (!workspaceId
        ? device.scope === 'personal'
        : visibility !== 'private'
          ? device.scope === 'workspace' && device.visibility === 'public'
          : true),
  );

export const useExecutionHost = (visibility?: 'private' | 'public') => {
  const workspaceId = useActiveWorkspaceId();
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
  const pickable = eligibleExecutionDevices(devices ?? [], workspaceId, visibility);
  const allowLocal = !workspaceId || visibility === 'private';
  const localId = allowLocal ? localDeviceId : undefined;
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

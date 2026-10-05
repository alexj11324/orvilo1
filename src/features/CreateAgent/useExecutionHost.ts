'use client';

import type { DeviceListItem } from '@orvilo/types';
import { useEffect, useMemo, useState } from 'react';

import { useDeviceList } from '@/features/DeviceManager';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';

export interface ExecutionHost {
  device?: DeviceListItem;
  deviceId?: string;
  /** The inventory settled and still no machine can run the agent. */
  exhausted: boolean;
  /** True when the resolved host is this computer (not a device-list row). */
  isLocal: boolean;
  loading: boolean;
  retry: () => Promise<unknown>;
}

/**
 * The execution host for a newly created agent. Device selection is an
 * advanced concern that lives in Settings → Devices — create never asks — so
 * the host resolves itself: this computer on Electron, then the first online
 * personal device. Same resolution order as onboarding's `useFirstAgentDevice`,
 * minus the onboarding writeback: a plain create flow must not mutate the
 * onboarding setup record.
 */
export const useExecutionHost = (): ExecutionHost => {
  const { data: devices, error, mutate } = useDeviceList();
  const [localDeviceId, setLocalDeviceId] = useState<string>();
  const [identityChecked, setIdentityChecked] = useState(false);

  useEffect(() => {
    let active = true;
    // The identity owner returns `{}` immediately off Electron, so web
    // resolves straight past this.
    void resolveLocalExecutionIdentity().then((identity) => {
      if (!active) return;
      setLocalDeviceId(identity.localDeviceId);
      setIdentityChecked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const pickable = useMemo(
    () => (devices ?? []).filter((device) => device.scope === 'personal' && device.online),
    [devices],
  );

  const deviceId = useMemo(() => {
    // A proven local identity IS the host — this computer is always a valid
    // execution target on desktop, even before the devices inventory synced.
    if (localDeviceId) return localDeviceId;
    return pickable[0]?.deviceId;
  }, [localDeviceId, pickable]);

  const resolved = identityChecked && (!!localDeviceId || devices !== undefined || !!error);

  return {
    device: deviceId ? devices?.find((device) => device.deviceId === deviceId) : undefined,
    deviceId: resolved ? deviceId : undefined,
    exhausted: resolved && !deviceId,
    isLocal: resolved && !!deviceId && deviceId === localDeviceId,
    loading: !resolved,
    retry: mutate,
  };
};

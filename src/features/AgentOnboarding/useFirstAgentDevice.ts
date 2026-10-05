'use client';

import { useEffect, useMemo, useState } from 'react';

import { useDeviceList } from '@/features/DeviceManager';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';
import { useUserStore } from '@/store/user';

/**
 * The onboarding execution host. Device selection is an advanced concern that
 * lives in Settings → Devices — onboarding never asks — so the host resolves
 * itself: this computer on Electron, then a previously persisted pick that is
 * still online, then the first online personal device. The resolved id is
 * checkpointed into the onboarding setup record so the finish step and any
 * resume path agree on it.
 */
export const useFirstAgentDevice = () => {
  const persisted = useUserStore((s) => s.onboarding?.setup?.firstAgentDeviceId);
  const { data: devices, error, isValidating, mutate } = useDeviceList();
  const [localDeviceId, setLocalDeviceId] = useState<string>();
  const [identityChecked, setIdentityChecked] = useState(false);

  useEffect(() => {
    let active = true;
    // No platform branch needed here: the identity owner itself returns `{}`
    // immediately off Electron, so web resolves straight past this.
    void resolveLocalExecutionIdentity().then((identity) => {
      if (!active) return;
      setLocalDeviceId(identity.localDeviceId);
      setIdentityChecked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Same legality the retired picker enforced: personal devices that are
  // online. Offline and workspace rows can never host the first agent.
  const pickable = useMemo(
    () => (devices ?? []).filter((device) => device.scope === 'personal' && device.online),
    [devices],
  );

  const deviceId = useMemo(() => {
    const ranked = [localDeviceId, persisted, pickable[0]?.deviceId];
    return ranked.find((id) => id && pickable.some((device) => device.deviceId === id));
  }, [localDeviceId, persisted, pickable]);

  // Wait for the inventory (and the desktop identity handshake) before writing
  // the checkpoint so a transient candidate isn't persisted ahead of this
  // computer.
  const resolved = devices !== undefined && identityChecked;
  useEffect(() => {
    if (!resolved || !deviceId || deviceId === persisted) return;
    const state = useUserStore.getState();
    void state
      .updateOnboarding({
        setup: { ...state.onboarding?.setup, firstAgentDeviceId: deviceId },
      })
      .catch(() => {});
  }, [deviceId, persisted, resolved]);

  return {
    deviceId: resolved ? deviceId : undefined,
    error,
    // True when the resolved host is this computer — the connect wizard
    // treats it as the `local` target, not as a device row to scan remotely.
    isLocalDevice: resolved && !!deviceId && deviceId === localDeviceId,
    // The list loaded but no candidate could host the agent — the user fixes
    // this under Settings → Devices.
    exhausted: resolved && !deviceId,
    loading: !resolved,
    retry: mutate,
    retrying: isValidating,
  };
};

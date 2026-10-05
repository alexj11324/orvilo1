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
    // A proven local identity IS the host — this computer is always a valid
    // execution target on desktop, even before the devices inventory has
    // synced its row. Gating it on `pickable` produced a false
    // "No connected device is online" on Electron.
    if (localDeviceId) return localDeviceId;
    const ranked = [persisted, pickable[0]?.deviceId];
    return ranked.find((id) => id && pickable.some((device) => device.deviceId === id));
  }, [localDeviceId, persisted, pickable]);

  // The desktop identity handshake alone can prove the host; the inventory is
  // only needed when it couldn't (web or unproven). An inventory error ends
  // resolution too — better the empty state with a Settings escape than a
  // spinner that never settles.
  const resolved = identityChecked && (!!localDeviceId || devices !== undefined || !!error);
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

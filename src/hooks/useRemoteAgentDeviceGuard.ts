import { isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import { useCallback, useEffect, useState } from 'react';

import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { deviceService } from '@/services/device';

export type RemoteAgentDeviceStatus =
  'checking' | 'device-offline' | 'no-device' | 'ok' | 'platform-unavailable';

interface UseRemoteAgentDeviceGuardOptions {
  /** The conversation's agent — validate this agent's bound device, not the global active one. */
  agentId: string;
  enabled?: boolean;
}

interface UseRemoteAgentDeviceGuardResult {
  refresh: () => void;
  status: RemoteAgentDeviceStatus;
}

/**
 * Checks whether the bound device is online and, for notify-based hetero
 * platforms, whether that platform is available on the device. Used in
 * HeterogeneousChatInput before device-dispatched hetero runs.
 */
export const useRemoteAgentDeviceGuard = ({
  agentId,
  enabled = true,
}: UseRemoteAgentDeviceGuardOptions): UseRemoteAgentDeviceGuardResult => {
  // Probe the Agent’s saved host; workspace members use the same binding.
  const { agencyConfig, isPreferenceLoading } = useTopicAgencyConfig(agentId);

  const boundDeviceId = agencyConfig?.boundDeviceId;
  const providerType = agencyConfig?.heterogeneousProvider?.type;

  const [status, setStatus] = useState<RemoteAgentDeviceStatus>('checking');

  const check = useCallback(async () => {
    if (!enabled) return;

    // Wait until the saved Agent configuration has loaded.
    if (isPreferenceLoading) {
      setStatus('checking');
      return;
    }

    if (!boundDeviceId) {
      setStatus('no-device');
      return;
    }

    setStatus('checking');

    try {
      const devices = await deviceService.listDevices();
      const device = devices.find((d) => d.deviceId === boundDeviceId);

      // A saved binding may point at another member’s enrolling identity,
      // which is intentionally absent from the caller-scoped device list. The
      // server owns that routing decision; absence here is not proof of offline.
      if (!device) {
        setStatus('ok');
        return;
      }

      if (!device.online) {
        setStatus('device-offline');
        return;
      }

      if (providerType && isRemoteHeterogeneousType(providerType)) {
        const capability = await deviceService.checkCapability({
          deviceId: boundDeviceId,
          platform: providerType,
        });
        setStatus(capability.available ? 'ok' : 'platform-unavailable');
      } else {
        setStatus('ok');
      }
    } catch {
      // On error, allow sending — don't block user on network issues
      setStatus('ok');
    }
  }, [enabled, isPreferenceLoading, boundDeviceId, providerType]);

  useEffect(() => {
    void check();
  }, [check]);

  // Re-check when window regains focus
  useEffect(() => {
    if (!enabled) return;
    const handler = () => void check();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enabled, check]);

  return { refresh: () => void check(), status };
};

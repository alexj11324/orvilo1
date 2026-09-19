import type { ClaudeCodeQuotaSnapshot } from '@orvilo/electron-client-ipc';

import { lambdaClient } from '@/libs/trpc/client';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { requireLocalExecutionTransport } from '@/services/targetRequiredError';

export interface FetchClaudeCodeQuotaSnapshotParams {
  /** Sample on this bound execution device via the gateway instead of local IPC. */
  deviceId?: string;
  env?: Record<string, string>;
  force?: boolean;
}

/**
 * Claude quota transport chokepoint, mirroring `GitService`: with a `deviceId`
 * the bound execution device samples its own login through the
 * `device.getClaudeCodeQuota` TRPC RPC; without one the local desktop samples
 * over Electron IPC. A client with neither (Web, no bound device) gets a typed
 * `TargetRequiredError` rather than a dead IPC call. `null` means the device is
 * offline or its client predates the quota RPC — callers fall back to
 * persisted windows.
 */
export const fetchClaudeCodeQuotaSnapshot = ({
  deviceId,
  env,
  force,
}: FetchClaudeCodeQuotaSnapshotParams): Promise<ClaudeCodeQuotaSnapshot | null> => {
  requireLocalExecutionTransport(deviceId, 'fetchClaudeCodeQuotaSnapshot');
  return deviceId
    ? lambdaClient.device.getClaudeCodeQuota.query({
        deviceId,
        env,
        ...(force ? { force: true } : {}),
      })
    : heterogeneousAgentService.getClaudeCodeQuota({ env, ...(force ? { force: true } : {}) });
};

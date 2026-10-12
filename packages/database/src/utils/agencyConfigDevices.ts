import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import type { PartialDeep } from 'type-fest';

/**
 * Collect device ids that an incoming `agencyConfig` patch is *setting*
 * (not clearing). `workingDirByDevice` entries with `undefined` value are
 * deletes (per `pruneWorkingDirByDeviceDeletes`) and are skipped.
 */
export const collectBoundDeviceIds = (
  agencyConfig: PartialDeep<OrviloAgentAgencyConfig> | null | undefined,
): string[] => {
  if (!agencyConfig) return [];
  const ids: string[] = [];
  const bound = agencyConfig.boundDeviceId;
  if (typeof bound === 'string' && bound) ids.push(bound);
  const map = agencyConfig.workingDirByDevice;
  if (map) {
    for (const [deviceId, cwd] of Object.entries(map)) {
      if (cwd === undefined) continue;
      ids.push(deviceId);
    }
  }
  return ids;
};

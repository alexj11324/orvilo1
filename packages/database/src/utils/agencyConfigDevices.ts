import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { and, eq, inArray } from 'drizzle-orm';
import type { PartialDeep } from 'type-fest';

import { devices } from '../schemas';
import type { OrviloDatabase, Transaction } from '../type';

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

/** Drop bindings outside the destination scope; missing hosts require explicit rebinding. */
export const sanitizeAgencyConfigsForWorkspace = async (
  db: OrviloDatabase | Transaction,
  targetWorkspaceId: string,
  agencyConfigs: Array<OrviloAgentAgencyConfig | null | undefined>,
  options?: { viewerUserId?: string },
): Promise<Array<OrviloAgentAgencyConfig | null>> => {
  const viewerUserId = options?.viewerUserId;
  const allCandidateIds = [
    ...new Set(agencyConfigs.flatMap((config) => collectBoundDeviceIds(config))),
  ];
  const deviceRows =
    allCandidateIds.length > 0
      ? await db
          .select({
            deviceId: devices.deviceId,
            userId: devices.userId,
            visibility: devices.visibility,
          })
          .from(devices)
          .where(
            and(
              eq(devices.workspaceId, targetWorkspaceId),
              inArray(devices.deviceId, allCandidateIds),
            ),
          )
      : [];
  const visibleRows = viewerUserId
    ? deviceRows.filter((r) => r.visibility === 'public' || r.userId === viewerUserId)
    : deviceRows;
  const allowed = new Set(visibleRows.map((r) => r.deviceId));

  return agencyConfigs.map((config) => {
    let next: OrviloAgentAgencyConfig | null = config ?? null;
    if (!next) return next;

    const candidateIds = collectBoundDeviceIds(next);
    if (candidateIds.length > 0) {
      const cleaned: OrviloAgentAgencyConfig = { ...next };
      if (cleaned.boundDeviceId && !allowed.has(cleaned.boundDeviceId)) {
        delete cleaned.boundDeviceId;
      }
      if (cleaned.workingDirByDevice) {
        const filtered: Record<string, string> = {};
        for (const [deviceId, cwd] of Object.entries(cleaned.workingDirByDevice)) {
          if (allowed.has(deviceId) && typeof cwd === 'string') filtered[deviceId] = cwd;
        }
        cleaned.workingDirByDevice = Object.keys(filtered).length > 0 ? filtered : undefined;
      }
      next = cleaned;
    }

    return next;
  });
};

import type {
  HeterogeneousAgentModelCatalog,
  HeterogeneousAgentPermissionCatalog,
  ListHeterogeneousAgentModelsParams,
  ListHeterogeneousAgentPermissionsParams,
} from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';
import { heterogeneousAgentService as electronHeterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { resolveLocalExecutionIdentity } from '@/services/localExecutionIdentity';
import { requireLocalExecutionTransport } from '@/services/targetRequiredError';

interface ListModelsParams extends ListHeterogeneousAgentModelsParams {
  deviceId?: string;
}

interface ListPermissionsParams extends ListHeterogeneousAgentPermissionsParams {
  deviceId?: string;
}

/**
 * Model-catalog transport boundary. A bound target goes through the device
 * gateway; an unbound target is the current Desktop and uses Electron IPC.
 * Without either (Web, no bound device) the call fails with a typed
 * `TargetRequiredError` — the IPC fallback never runs on a client that has no
 * local runtime.
 */
class HeterogeneousAgentCatalogService {
  async listPermissions({
    deviceId,
    ...params
  }: ListPermissionsParams): Promise<HeterogeneousAgentPermissionCatalog[]> {
    requireLocalExecutionTransport(
      deviceId,
      'listPermissions',
      await resolveLocalExecutionIdentity(),
    );
    return deviceId
      ? lambdaClient.device.listHeterogeneousAgentPermissions.query({ deviceId, ...params })
      : electronHeterogeneousAgentService.listPermissions(params);
  }

  async listModels({
    deviceId,
    ...params
  }: ListModelsParams): Promise<HeterogeneousAgentModelCatalog> {
    requireLocalExecutionTransport(deviceId, 'listModels', await resolveLocalExecutionIdentity());
    return deviceId
      ? lambdaClient.device.listHeterogeneousAgentModels.query({ deviceId, ...params })
      : electronHeterogeneousAgentService.listModels(params);
  }
}

export const heterogeneousAgentCatalogService = new HeterogeneousAgentCatalogService();

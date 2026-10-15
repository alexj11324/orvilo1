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
  agentId?: string;
  deviceId?: string;
}

interface ListPermissionsParams extends ListHeterogeneousAgentPermissionsParams {
  agentId?: string;
  deviceId?: string;
}

/**
 * Model-catalog transport boundary. This Desktop's proven device uses Electron
 * IPC, including an explicit binding to it; other bound devices use the gateway.
 * Without either (Web, no bound device) the call fails with a typed
 * `TargetRequiredError` — the IPC fallback never runs on a client that has no
 * local runtime.
 */
class HeterogeneousAgentCatalogService {
  async listPermissions({
    agentId,
    deviceId,
    ...params
  }: ListPermissionsParams): Promise<HeterogeneousAgentPermissionCatalog[]> {
    const identity = await resolveLocalExecutionIdentity();
    requireLocalExecutionTransport(deviceId, 'listPermissions', identity);
    return deviceId && deviceId !== identity.localDeviceId
      ? lambdaClient.device.listHeterogeneousAgentPermissions.query({
          agentId,
          deviceId,
          ...params,
        })
      : electronHeterogeneousAgentService.listPermissions(params);
  }

  async listModels({
    agentId,
    deviceId,
    ...params
  }: ListModelsParams): Promise<HeterogeneousAgentModelCatalog> {
    const identity = await resolveLocalExecutionIdentity();
    requireLocalExecutionTransport(deviceId, 'listModels', identity);
    return deviceId && deviceId !== identity.localDeviceId
      ? lambdaClient.device.listHeterogeneousAgentModels.query({ agentId, deviceId, ...params })
      : electronHeterogeneousAgentService.listModels(params);
  }
}

export const heterogeneousAgentCatalogService = new HeterogeneousAgentCatalogService();

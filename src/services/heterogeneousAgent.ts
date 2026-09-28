import type {
  HeterogeneousAgentModelCatalog,
  ListHeterogeneousAgentModelsParams,
} from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';
import { heterogeneousAgentService as electronHeterogeneousAgentService } from '@/services/electron/heterogeneousAgent';
import { requireLocalExecutionTransport } from '@/services/targetRequiredError';

interface ListModelsParams extends ListHeterogeneousAgentModelsParams {
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
  listModels({ deviceId, ...params }: ListModelsParams): Promise<HeterogeneousAgentModelCatalog> {
    requireLocalExecutionTransport(deviceId, 'listModels');
    return deviceId
      ? lambdaClient.device.listHeterogeneousAgentModels.query({ deviceId, ...params })
      : electronHeterogeneousAgentService.listModels(params);
  }
}

export const heterogeneousAgentCatalogService = new HeterogeneousAgentCatalogService();

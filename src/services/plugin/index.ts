import { type OrviloTool } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export class PluginService {
  getInstalledPlugins = (): Promise<OrviloTool[]> => lambdaClient.plugin.getPlugins.query();
}

export const pluginService = new PluginService();

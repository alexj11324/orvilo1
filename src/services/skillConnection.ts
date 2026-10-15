import { toolsClient } from '@/libs/trpc/client';

class SkillConnectionService {
  connectCallTool = (...args: Parameters<typeof toolsClient.market.connectCallTool.mutate>) =>
    toolsClient.market.connectCallTool.mutate(...args);

  connectGetStatus = (...args: Parameters<typeof toolsClient.market.connectGetStatus.query>) =>
    toolsClient.market.connectGetStatus.query(...args);

  connectGetAuthorizeUrl = (...args: Parameters<typeof toolsClient.market.connectGetAuthorizeUrl.query>) =>
    toolsClient.market.connectGetAuthorizeUrl.query(...args);

  connectRefresh = (...args: Parameters<typeof toolsClient.market.connectRefresh.mutate>) =>
    toolsClient.market.connectRefresh.mutate(...args);

  connectListTools = (...args: Parameters<typeof toolsClient.market.connectListTools.query>) =>
    toolsClient.market.connectListTools.query(...args);

  connectRevoke = (...args: Parameters<typeof toolsClient.market.connectRevoke.mutate>) =>
    toolsClient.market.connectRevoke.mutate(...args);

  connectListConnections = (...args: Parameters<typeof toolsClient.market.connectListConnections.query>) =>
    toolsClient.market.connectListConnections.query(...args);

}

export const skillConnectionService = new SkillConnectionService();

import type { OrviloTool } from '@orvilo/types';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { PluginModel } from '@/database/models/plugin';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';

/** Historical plugin records remain readable; native harnesses own installation. */
export const pluginRouter = router({
  getPlugins: wsCompatProcedure
    .use(serverDatabase)
    .query(async ({ ctx }): Promise<OrviloTool[]> => {
      const pluginModel = new PluginModel(ctx.serverDB, ctx.userId, ctx.workspaceId ?? undefined);
      return pluginModel.query();
    }),
});

export type PluginRouter = typeof pluginRouter;

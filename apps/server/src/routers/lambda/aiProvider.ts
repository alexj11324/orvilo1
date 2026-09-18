import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AiInfraRepos } from '@/database/repositories/aiInfra';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { getUserScopedAiProviderRuntimeState } from '@/server/services/aiProviderAccess';
import { type AiProviderRuntimeState } from '@/types/aiProvider';
import { type ProviderConfig } from '@/types/user/settings';

const aiProviderProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;

  const { aiProvider } = await getServerGlobalConfig();

  return opts.next({
    ctx: {
      aiInfraRepos: new AiInfraRepos(
        ctx.serverDB,
        ctx.userId,
        aiProvider as Record<string, ProviderConfig>,
        ctx.workspaceId ?? undefined,
      ),
    },
  });
});

export const aiProviderRouter = router({
  /**
   * Deployment model catalog for the client pickers (enabled providers/models
   * resolved from env-seeded rows and global config). Provider management is
   * retired — credentials (`runtimeConfig.keyVaults`) are never returned, even
   * to full-access callers, because the retired client runtime was their only
   * consumer.
   */
  getAiProviderRuntimeState: aiProviderProcedure
    .input(z.object({ isLogin: z.boolean().optional() }))
    .query(async ({ ctx }): Promise<AiProviderRuntimeState> => {
      const state = await getUserScopedAiProviderRuntimeState(ctx.userId, () =>
        ctx.aiInfraRepos.getAiProviderRuntimeState(KeyVaultsGateKeeper.getUserKeyVaults),
      );

      return {
        ...state,
        runtimeConfig: Object.fromEntries(
          Object.entries(state.runtimeConfig).map(([id, config]) => [
            id,
            { ...config, keyVaults: {} },
          ]),
        ),
      };
    }),
});

export type AiProviderRouter = typeof aiProviderRouter;

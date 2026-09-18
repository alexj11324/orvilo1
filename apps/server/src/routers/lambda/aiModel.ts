import { AiModelReasoningConfigSchema, type AiProviderModelListItem } from 'model-bank';
import { z } from 'zod';

import { wsCompatProcedure } from '@/business/server/trpc-middlewares/workspaceAuth';
import { AiModelModel } from '@/database/models/aiModel';
import { AiInfraRepos } from '@/database/repositories/aiInfra';
import { router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { getUserScopedAiProviderModelList } from '@/server/services/aiProviderAccess';
import { type ProviderConfig } from '@/types/user/settings';

const aiModelProcedure = wsCompatProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const wsId = ctx.workspaceId ?? undefined;

  const { aiProvider } = await getServerGlobalConfig();

  return opts.next({
    ctx: {
      aiInfraRepos: new AiInfraRepos(
        ctx.serverDB,
        ctx.userId,
        aiProvider as Record<string, ProviderConfig>,
        wsId,
      ),
      aiModelModel: new AiModelModel(ctx.serverDB, ctx.userId, wsId),
    },
  });
});

// Provider/model management is retired — the catalog is deployment-owned
// (env-seeded rows). What remains: the read-only catalog list used by runtime
// surfaces (image-generation tool model pickers) and the per-user reasoning
// preference, which is personal-scope by design (workspaceId ignored): the
// user's default reasoning params for a model instance are keyed by
// userId + providerId + modelId and shared across workspaces. See
// AiModelModel.getModelReasoningConfig.
export const aiModelRouter = router({
  getAiModelReasoningConfig: aiModelProcedure
    .input(z.object({ id: z.string(), providerId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await ctx.aiModelModel.getModelReasoningConfig(input.id, input.providerId);
    }),

  getAiProviderModelList: aiModelProcedure
    .input(
      z.object({
        enabled: z.boolean().optional(),
        id: z.string(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
        type: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<AiProviderModelListItem[]> => {
      const options = {
        enabled: input.enabled,
        limit: input.limit,
        offset: input.offset,
        type: input.type,
      };

      return getUserScopedAiProviderModelList(ctx.userId, input.id, options, (scopedOptions) =>
        ctx.aiInfraRepos.getAiProviderModelList(input.id, scopedOptions),
      );
    }),

  updateAiModelReasoningConfig: aiModelProcedure
    .input(
      z.object({
        id: z.string(),
        providerId: z.string(),
        value: AiModelReasoningConfigSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.aiModelModel.updateModelReasoningConfig(input.id, input.providerId, input.value);
    }),
});

export type AiModelRouter = typeof aiModelRouter;

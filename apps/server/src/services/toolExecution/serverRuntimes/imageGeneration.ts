import type { ImageGenerationModelSummary } from '@orvilo/builtin-tool-image-generation';
import { ImageGenerationIdentifier } from '@orvilo/builtin-tool-image-generation';
import { ImageGenerationExecutionRuntime } from '@orvilo/builtin-tool-image-generation/executionRuntime';
import { loadModels } from '@orvilo/business-model-bank/model-config';
import { RequestTrigger, toAgentShareVisitorIds } from '@orvilo/types';
import type { OrviloDefaultAiModelListItem } from 'model-bank';

import { generationRouter } from '@/server/routers/lambda/generation';
import { generationTopicRouter } from '@/server/routers/lambda/generationTopic';
import { imageRouter } from '@/server/routers/lambda/image';

import { type ServerRuntimeRegistration } from './types';

const normalizeModel = (model: OrviloDefaultAiModelListItem): ImageGenerationModelSummary => ({
  description: model.description,
  displayName: model.displayName,
  id: model.id,
  parameters: model.parameters,
  pricing: model.pricing,
  releasedAt: model.releasedAt,
});

export const imageGenerationRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId) {
      throw new Error('userId is required for Image Generation tool execution');
    }

    const callerContext = {
      clientIp: context.clientIp,
      /**
       * A share-visitor run executes under the shared agent's CREATOR, so the
       * image spend it triggers is indistinguishable from the creator's own
       * usage unless the origin is stamped on the charge. Projected fields
       * only — never spread `context.agentShareVisitor`, which also carries the
       * run's tool/memory permissions.
       */
      spendOrigin: context.agentShareVisitor
        ? {
            agentShare: toAgentShareVisitorIds(context.agentShareVisitor),
            trigger: RequestTrigger.AgentShare,
          }
        : undefined,
      userId: context.userId,
      workspaceId: context.workspaceId,
    };
    const generationCaller = generationRouter.createCaller(callerContext);
    const generationTopicCaller = generationTopicRouter.createCaller(callerContext);
    const imageCaller = imageRouter.createCaller(callerContext);

    return new ImageGenerationExecutionRuntime({
      createGenerationTopic: (type, title) =>
        generationTopicCaller.createTopic({
          title,
          type,
          ...(context.agentVisibility === 'private' || context.agentVisibility === 'public'
            ? { visibility: context.agentVisibility }
            : {}),
        }),
      createImage: (payload) => imageCaller.createImage(payload),
      getGenerationStatus: async ({ asyncTaskId, generationId }) => {
        const result = await generationCaller.getGenerationStatus({ asyncTaskId, generationId });
        return {
          ...result,
          asyncTaskId,
          generationId,
        };
      },
      listImageModels: async ({ provider, limit }) => {
        // Static builtin catalog — the user-managed provider runtime is retired.
        const imageModels = (await loadModels()).filter(
          (model) => model.type === 'image' && model.enabled,
        );
        const providerIds = [...new Set(imageModels.map((model) => model.providerId))];
        const enabledProviders = provider
          ? providerIds.filter((id) => id === provider)
          : providerIds;

        const providers = enabledProviders
          .map((id) => {
            const models = imageModels.filter((model) => model.providerId === id);
            const limitedModels = typeof limit === 'number' ? models.slice(0, limit) : models;

            return { id, models: limitedModels.map(normalizeModel), name: id };
          })
          .filter((item) => item.models.length > 0);

        return {
          providers,
          totalModels: providers.reduce((sum, item) => sum + item.models.length, 0),
        };
      },
    });
  },
  identifier: ImageGenerationIdentifier,
};

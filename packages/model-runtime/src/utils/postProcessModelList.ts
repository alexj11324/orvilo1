import type { ChatModelCard } from '@orvilo/types';
import type { AiModelType } from 'model-bank';

/**
 * Process model list: ensure every model carries a type field
 */
export async function postProcessModelList(
  models: ChatModelCard[],
  getModelTypeProperty?: (modelId: string) => Promise<AiModelType>,
): Promise<ChatModelCard[]> {
  return Promise.all(
    models.map(async (model) => {
      let modelType: AiModelType | undefined = model.type;

      if (!modelType && getModelTypeProperty) {
        modelType = await getModelTypeProperty(model.id);
      }

      return {
        ...model,
        type: modelType || 'chat',
      };
    }),
  );
}

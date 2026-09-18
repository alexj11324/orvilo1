import {
  type AiModelReasoningConfig,
  type AiModelType,
  type AiProviderModelListItem,
  type ToggleAiModelEnableParams,
} from 'model-bank';
import { isAiModelVisible } from 'model-bank/aiModel';

import { lambdaClient } from '@/libs/trpc/client';

export interface GetAiProviderModelListParams {
  enabled?: boolean;
  limit?: number;
  offset?: number;
  type?: AiModelType;
}

export class AiModelService {
  getAiProviderModelList = async (
    id: string,
    params?: GetAiProviderModelListParams,
  ): Promise<AiProviderModelListItem[]> => {
    const models = await lambdaClient.aiModel.getAiProviderModelList.query({ id, ...params });
    return models.filter(isAiModelVisible);
  };

  toggleModelEnabled = async (params: ToggleAiModelEnableParams) => {
    return lambdaClient.aiModel.toggleModelEnabled.mutate(params);
  };

  getAiModelReasoningConfig = async (
    id: string,
    providerId: string,
  ): Promise<AiModelReasoningConfig | undefined> => {
    return lambdaClient.aiModel.getAiModelReasoningConfig.query({ id, providerId });
  };

  updateAiModelReasoningConfig = async (
    id: string,
    providerId: string,
    value: AiModelReasoningConfig,
  ) => {
    return lambdaClient.aiModel.updateAiModelReasoningConfig.mutate({ id, providerId, value });
  };
}

export const aiModelService = new AiModelService();

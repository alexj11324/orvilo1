import { type AiModelReasoningConfig, type ToggleAiModelEnableParams } from 'model-bank';

import { lambdaClient } from '@/libs/trpc/client';

export class AiModelService {
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

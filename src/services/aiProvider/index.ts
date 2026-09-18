import { lambdaClient } from '@/libs/trpc/client';
import { type AiProviderRuntimeState } from '@/types/aiProvider';

export class AiProviderService {
  getAiProviderRuntimeState = async (isLogin?: boolean): Promise<AiProviderRuntimeState> => {
    return lambdaClient.aiProvider.getAiProviderRuntimeState.query({ isLogin });
  };
}

export const aiProviderService = new AiProviderService();

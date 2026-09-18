import { lambdaClient } from '@/libs/trpc/client';
import { type AiProviderRuntimeState } from '@/types/aiProvider';

export class AiProviderService {
  /**
   * Enable/disable a provider from chat-facing surfaces. Provider CRUD is
   * retired from the web client.
   */
  toggleProviderEnabled = async (id: string, enabled: boolean) => {
    return lambdaClient.aiProvider.toggleProviderEnabled.mutate({ enabled, id });
  };

  getAiProviderRuntimeState = async (isLogin?: boolean): Promise<AiProviderRuntimeState> => {
    return lambdaClient.aiProvider.getAiProviderRuntimeState.query({ isLogin });
  };
}

export const aiProviderService = new AiProviderService();

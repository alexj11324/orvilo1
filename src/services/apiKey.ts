import { lambdaClient } from '@/libs/trpc/client';

class ApiKeyService {
  getApiKeys = (...args: Parameters<typeof lambdaClient.apiKey.getApiKeys.query>) =>
    lambdaClient.apiKey.getApiKeys.query(...args);

  createApiKey = (...args: Parameters<typeof lambdaClient.apiKey.createApiKey.mutate>) =>
    lambdaClient.apiKey.createApiKey.mutate(...args);

  updateApiKey = (...args: Parameters<typeof lambdaClient.apiKey.updateApiKey.mutate>) =>
    lambdaClient.apiKey.updateApiKey.mutate(...args);

  deleteApiKey = (...args: Parameters<typeof lambdaClient.apiKey.deleteApiKey.mutate>) =>
    lambdaClient.apiKey.deleteApiKey.mutate(...args);

}

export const apiKeyService = new ApiKeyService();

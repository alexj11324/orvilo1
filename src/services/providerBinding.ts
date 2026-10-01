import type { ProviderBindingConfig } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export const providerBindingService = {
  list: () => lambdaClient.providerBinding.list.query(),
  create: (config: ProviderBindingConfig) => lambdaClient.providerBinding.create.mutate(config),
  update: (id: string, revision: number, config: ProviderBindingConfig) =>
    lambdaClient.providerBinding.update.mutate({ id, revision, config }),
  delete: (id: string, revision: number) =>
    lambdaClient.providerBinding.delete.mutate({ id, revision }),
  checkConnection: (id: string, revision: number) =>
    lambdaClient.providerBinding.checkConnection.mutate({ id, revision }),
};

import type {
  ProviderBinding as CanonicalProviderBinding,
  ProviderConfigurationScope,
  TrustedProviderBackend,
} from '@orvilo/agent-execution/controlPlane';
import {
  CONTROL_PLANE_VERSION,
  createProviderConfigurationBroker,
} from '@orvilo/agent-execution/controlPlane';

import type { ProviderBindingModel } from '@/database/models/providerBinding';

import type { ProviderConfigurationComposition } from './configuration';

/** Personal settings have no workspace tenant. This scope is not a task fence. */
export const personalProviderScope = (userId: string): ProviderConfigurationScope => ({
  authorityRevision: 0,
  ownerId: userId,
  principalId: userId,
  tenantId: `user:${userId}`,
});

const providerNetworkDisabled: TrustedProviderBackend = {
  capabilities() {
    return Promise.reject(new Error('Provider network is disabled'));
  },
  check() {
    return Promise.reject(new Error('Provider network is disabled'));
  },
  async *infer() {
    yield {
      type: 'error',
      error: {
        code: 'runtime_failed',
        message: 'Provider inference is disabled',
        retryable: false,
      },
    };
  },
};

/** Canonical broker with authority checks. Network and inference stay refused, so status cannot become ready. */
export const createClosedProviderComposition = (
  model: ProviderBindingModel,
  userId: string,
): ProviderConfigurationComposition => {
  const scope = personalProviderScope(userId);
  return {
    authorizeScope: async (requestedUserId) => {
      if (requestedUserId !== userId) throw new Error('Provider scope user mismatch');
      return personalProviderScope(requestedUserId);
    },
    broker: createProviderConfigurationBroker({
      authority: {
        resolve: async (request) => {
          const row = await model.find(request.bindingId);
          if (!row) throw new Error('Provider binding is unavailable');
          const binding: CanonicalProviderBinding = {
            bindingId: row.id,
            modelRoutes: [row.config.model],
            ownerId: userId,
            providerId: row.config.provider,
            revision: row.revision,
            schemaVersion: CONTROL_PLANE_VERSION,
            secretReference: row.config.secretReference,
            tenantId: scope.tenantId,
          };
          return {
            binding,
            canCheck: await model.ownsCredentialReference(row.config.secretReference),
            revoked:
              request.scope.ownerId !== scope.ownerId ||
              request.scope.principalId !== scope.principalId ||
              request.scope.tenantId !== scope.tenantId ||
              request.scope.authorityRevision !== scope.authorityRevision,
            scope,
          };
        },
      },
      backend: providerNetworkDisabled,
    }),
  };
};

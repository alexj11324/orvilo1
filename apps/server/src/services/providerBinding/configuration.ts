import type {
  ProviderBindingCheck,
  ProviderConfigurationBroker,
  ProviderConfigurationScope,
} from '@orvilo/agent-execution/controlPlane';
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { TRPCError } from '@trpc/server';

import type { ProviderBindingModel } from '@/database/models/providerBinding';

/** Host composition supplies the canonical broker and an authoritative scope resolver. */
export interface ProviderConfigurationComposition {
  authorizeScope: (userId: string) => Promise<ProviderConfigurationScope>;
  broker: ProviderConfigurationBroker;
}

export async function checkProviderBinding(
  model: ProviderBindingModel,
  userId: string,
  input: { id: string; revision: number },
  composition?: ProviderConfigurationComposition,
): Promise<ProviderBindingCheck> {
  const load = async () => {
    const row = await model.find(input.id);
    if (!row || row.revision !== input.revision) {
      throw new TRPCError({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
    }
    if (!(await model.ownsCredentialReference(row.config.secretReference))) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return row;
  };

  const row = await load();
  if (!composition) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_BROKER_UNAVAILABLE' });
  }

  const scope = structuredClone(await composition.authorizeScope(userId));
  if (scope.ownerId !== userId || scope.principalId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  // The scope is resolved by the server; configuration checks never invent a task fence.
  const result = await composition.broker
    .checkBinding({
      schemaVersion: 1,
      scope,
      bindingId: row.id,
      bindingRevision: row.revision,
    })
    .catch(() => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_CHECK_UNAVAILABLE' });
    });
  // Authentication alone does not prove the selected model can run. Use the
  // same broker capabilities that issuance uses before arming this route.
  const capabilities =
    result.ok &&
    result.value.status === 'ready' &&
    row.config.model !== PROVIDER_CONFIG_ANCHOR_MODEL
      ? await composition.broker
          .capabilities({
            schemaVersion: 1,
            scope,
            bindingId: row.id,
            bindingRevision: row.revision,
          })
          .catch(() => {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'PROVIDER_CHECK_UNAVAILABLE',
            });
          })
      : undefined;
  const fresh = await load();
  const freshScope = await composition.authorizeScope(userId);
  if (
    fresh.config.secretReference !== row.config.secretReference ||
    freshScope.tenantId !== scope.tenantId ||
    freshScope.ownerId !== scope.ownerId ||
    freshScope.principalId !== scope.principalId ||
    freshScope.authorityRevision !== scope.authorityRevision
  ) {
    throw new TRPCError({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
  }
  if (!result.ok) {
    // Broker error details remain inside the trusted server boundary.
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'PROVIDER_CHECK_UNAVAILABLE' });
  }
  if (result.value.bindingId !== row.id || result.value.bindingRevision !== row.revision) {
    throw new TRPCError({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
  }
  if (
    result.value.status === 'ready' &&
    row.config.model !== PROVIDER_CONFIG_ANCHOR_MODEL &&
    (!capabilities?.ok ||
      !capabilities.value.some((item) => item.modelRoute === row.config.model && item.text))
  ) {
    return { ...result.value, status: 'unavailable' };
  }
  // A verified binding is enabled for runtime execution; a check that the
  // provider rejected (`unavailable`) must not arm it. Enabling is not a
  // config edit — `revision` stays put, and the next save lands
  // `enabled: false` again until re-verified.
  if (result.value.status === 'ready' && !(await model.setEnabled(row.id, true))) {
    throw new TRPCError({ code: 'CONFLICT', message: 'BINDING_UNAVAILABLE_OR_CHANGED' });
  }
  return result.value;
}

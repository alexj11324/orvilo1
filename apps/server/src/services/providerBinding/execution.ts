import type { ProviderBinding } from '@orvilo/agent-execution/controlPlane';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane';
import type { OrviloEngineKind, ProviderBindingConfig } from '@orvilo/types';
import { resolveOrviloEngine } from '@orvilo/types';

import { ProviderBindingModel } from '@/database/models/providerBinding';
import type { OrviloDatabase } from '@/database/type';

/**
 * Binding rows whose selection admits a run on the Orvilo runtime. Resolution
 * is a read only — it never issues credentials; `issueBindingExecution` is the
 * fence. `list` orders by `updatedAt` descending, so the most recently saved
 * matching binding wins.
 */
export async function resolveOrviloProviderBinding(
  db: OrviloDatabase,
  userId: string,
  engine: OrviloEngineKind | string | null | undefined,
  target: ProviderBindingConfig['selection']['target'],
) {
  const wanted = resolveOrviloEngine(engine);
  const rows = await new ProviderBindingModel(db, userId).list();
  return rows.find((row) => {
    const selection = row.config?.selection;
    if (!selection || selection.runtime !== 'orvilo' || selection.target !== target) return false;
    return resolveOrviloEngine(selection.engine) === wanted;
  });
}

/**
 * The run-grant scope a binding may be issued in. `ownerId` is the
 * server-derived delegation subject (never agent payload); `tenantId` is the
 * canonical run tenant (workspace id) stamped onto the contract binding.
 */
export interface BindingExecutionClaim {
  bindingId: string;
  bindingRevision: number;
  ownerId: string;
  tenantId: string;
}

export interface IssuedByokExecution {
  binding: ProviderBinding;
}

/**
 * Revision-fenced issuance: re-load the binding inside the caller's
 * transaction, refuse a row that moved, and prove the referenced credential is
 * still a personal credential owned by the claiming user. Decryption never
 * happens here — the issued binding carries only the vault `secretReference`,
 * which `SqlTrustedProviderBackend` resolves host-side at request time.
 * `undefined` means unavailable; callers fail loudly, never fall back to
 * environment keys.
 */
export async function issueBindingExecution(
  db: OrviloDatabase,
  claim: BindingExecutionClaim,
): Promise<IssuedByokExecution | undefined> {
  const model = new ProviderBindingModel(db, claim.ownerId);
  const row = await model.find(claim.bindingId);
  if (!row || row.revision !== claim.bindingRevision) return undefined;
  const config = row.config;
  if (!config || !(await model.ownsCredentialReference(config.secretReference))) return undefined;
  return {
    binding: {
      bindingId: row.id,
      modelRoutes: [config.model],
      ownerId: row.userId,
      providerId: config.provider,
      revision: row.revision,
      schemaVersion: CONTROL_PLANE_VERSION,
      secretReference: config.secretReference,
      tenantId: claim.tenantId,
    },
  };
}

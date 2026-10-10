import type {
  AiProviderDetailItem,
  AiProviderListItem,
  AiProviderRuntimeConfig,
  AiProviderSettings,
  CreateAiProviderParams,
  CredentialKVPayload,
  ProviderBindingConfig,
  ProviderBindingProviderSettings,
  UpdateAiProviderConfigParams,
  UpdateAiProviderParams,
} from '@orvilo/types';
import { PROVIDER_CONFIG_ANCHOR_MODEL } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import { and, eq, isNull, or } from 'drizzle-orm';
import { ModelProvider } from 'model-bank';

import { CredentialModel } from '../../models/credential';
import { ProviderBindingModel } from '../../models/providerBinding';
import { aiModels, aiProviders } from '../../schemas';
import type { OrviloDatabase } from '../../type';

/**
 * Legacy `ai_providers.keyVaults` decryptor — server callers inject
 * `KeyVaultsGateKeeper.getUserKeyVaults` (a `UserKeyVaults` interface
 * without an index signature), so the return is `unknown` and narrowed with
 * `isRecord` at the use site.
 */
type DecryptUserKeyVaults = (keyVaults: string | null) => Promise<unknown>;

type ProviderBindingRow = Awaited<ReturnType<ProviderBindingModel['list']>>[number];

/**
 * Rows of one provider: `anchor` carries the provider-level surface (sentinel
 * `model`), `models` are the per-model route rows the resolver matches.
 */
interface BoundProvider {
  anchor?: ProviderBindingRow;
  models: ProviderBindingRow[];
}

export interface ProviderBindingPlaneDeps {
  /**
   * Decryptor for legacy `ai_providers.keyVaults` — that column uses
   * `KeyVaultsGateKeeper` encryption, which is a server-module dependency, so
   * callers inject it. Falls back to plain JSON parse (test stores).
   */
  decryptLegacyKeyVaults?: DecryptUserKeyVaults;
  /**
   * The provider's effective enabled-model id set (builtin catalog defaults +
   * `ai_models.enabled` overrides). Used when a provider migrates onto the
   * binding plane so its existing enabled models become resolvable rows.
   */
  resolveEnabledModelIds?: (providerId: string) => Promise<string[]>;
  /** Server-owned verification; absent compositions always leave routes disarmed. */
  verifyBindings?: (rows: ProviderBindingRow[]) => Promise<unknown>;
  /**
   * The caller's workspace scope. Bindings and credentials themselves are
   * always personal — this only selects which legacy `ai_providers`/`ai_models`
   * rows the plane's migrate-on-write, conflict check, and erasure see:
   * workspace scope reads the workspace's shared rows plus the caller's own
   * unfiled rows (mirroring `buildWorkspaceWhere`), personal scope reads only
   * own unfiled rows.
   */
  workspaceId?: string;
}

/** Thrown when a write targets a provider id that already exists. */
export class ProviderBindingConflictError extends Error {
  readonly code = 'CONFLICT';
}

const PROVIDER_CREDENTIAL_KEY = (providerId: string) => `provider-binding:${providerId}`;

/**
 * Placeholder endpoint for providers whose keyVaults carry no URL (e.g. SDK
 * providers like Bedrock that configure region + keys instead). Such bindings
 * remain disarmed and are explained as missing-endpoint in the picker.
 */
const PLACEHOLDER_ENDPOINT = 'https://bindings.invalid/no-endpoint';

/** keyVaults keys that carry the upstream endpoint rather than a secret. */
const ENDPOINT_KEYS = ['baseURL', 'endpoint'] as const;

/**
 * Nested `keyVaults` values (e.g. `customHeaders` maps) cannot live in a
 * credential's flat `values` record — they are JSON-encoded under
 * `<key>.__json` and expanded back on materialization.
 */
const JSON_VALUE_SUFFIX = '.__json';

const flattenKeyVaults = (keyVaults: Record<string, unknown>): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(keyVaults)) {
    if (typeof value === 'string') values[key] = value;
    else if (value && typeof value === 'object')
      values[`${key}${JSON_VALUE_SUFFIX}`] = JSON.stringify(value);
  }
  return values;
};

const unflattenKeyVaults = (values: Record<string, string>): Record<string, unknown> => {
  const keyVaults: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith(JSON_VALUE_SUFFIX)) {
      try {
        keyVaults[key.slice(0, -JSON_VALUE_SUFFIX.length)] = JSON.parse(value);
      } catch {
        // A malformed blob is dropped rather than leaked as a raw string.
      }
    } else {
      keyVaults[key] = value;
    }
  }
  return keyVaults;
};

const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const resolveEndpoint = (providerId: string, keyVaults: Record<string, unknown>): string => {
  for (const key of ENDPOINT_KEYS) {
    const value = keyVaults[key];
    if (typeof value === 'string' && URL.canParse(value)) return value;
  }
  return DEFAULT_ENDPOINTS[providerId] ?? PLACEHOLDER_ENDPOINT;
};

/**
 * Binding target for a restored provider: `fetchOnClient` means requests run
 * from the user's own host. Plain-http endpoints are forced `local` —
 * sandbox-resolved bindings may only carry https endpoints.
 */
const resolveTarget = (
  providerSettings: { fetchOnClient?: boolean },
  endpoint: string,
): ProviderBindingConfig['selection']['target'] =>
  providerSettings.fetchOnClient || !endpoint.startsWith('https:') ? 'local' : 'sandbox';

const buildSelection = (
  providerSettings: { fetchOnClient?: boolean },
  endpoint: string,
): ProviderBindingConfig['selection'] => ({
  effort: 'default',
  mode: 'default',
  runtime: 'orvilo',
  speed: 'default',
  target: resolveTarget(providerSettings, endpoint),
});

const isBuiltinProvider = (id: string) =>
  Object.values(ModelProvider).includes(id as ModelProvider);

const secretReferenceOf = (credentialId: string) => `credential:${credentialId}`;

/**
 * The provider-configuration plane on top of `provider_bindings` +
 * `credentials` — the storage target the restored provider settings surface
 * reconciles onto (Phase 5b). Provider settings are a personal credential
 * surface by design — every write lands here regardless of the caller's
 * workspace context (credentials are personal, `tenantId` is stamped at
 * issuance). `deps.workspaceId` only scopes which legacy `ai_providers`/
 * `ai_models` rows migrate-on-write, conflict checks, and erasure see.
 *
 * Storage mapping (restored surface → binding rows):
 * - provider entity + enable switch + sort + custom metadata → anchor row
 *   (`model === PROVIDER_CONFIG_ANCHOR_MODEL`) `providerSettings`
 * - apiKey and other `keyVaults` entries → one `credentials` row per provider
 *   (nested maps JSON-encoded under `<key>.__json`); referenced as
 *   `credential:<id>` in `secretReference`
 * - `keyVaults.baseURL`/`endpoint` → `endpoint` (replicated on every row)
 * - `fetchOnClient` → `selection.target` (`'local'` vs `'sandbox'`)
 * - `config` blob, `settings` (form schema), `checkModel` → `providerSettings`
 * - enabled-model routes → one row per enabled model; disabling a model
 *   deletes its row; disabling the provider keeps rows with `enabled: false`
 * - `ai_models` remains the model registry plane (metadata + enabled set);
 *   the legacy `ai_providers` row is deleted once the provider migrates here
 */
export class ProviderBindingPlane {
  private readonly bindings: ProviderBindingModel;
  private readonly credentials: CredentialModel;

  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly deps: ProviderBindingPlaneDeps = {},
  ) {
    this.bindings = new ProviderBindingModel(db, userId);
    this.credentials = new CredentialModel(db, userId);
  }

  // ===== read plane =====

  /**
   * All binding rows for this user grouped by provider. Rows written outside
   * the restored surface (no anchor, e.g. the ProviderBindings UI) appear as
   * `anchor: undefined` and are not treated as provider configuration.
   */
  async listManagedProviders(): Promise<Map<string, BoundProvider>> {
    const rows = await this.bindings.list();
    const grouped = new Map<string, BoundProvider>();

    for (const row of rows) {
      const config = row.config;
      if (!config?.provider) continue;
      const entry = grouped.get(config.provider) ?? { models: [] };
      if (config.model === PROVIDER_CONFIG_ANCHOR_MODEL) entry.anchor = row;
      else entry.models.push(row);
      grouped.set(config.provider, entry);
    }

    return grouped;
  }

  /** The provider's binding state, present only when an anchor row exists. */
  async getManaged(providerId: string): Promise<BoundProvider | undefined> {
    const bound = (await this.listManagedProviders()).get(providerId);
    return bound?.anchor ? bound : undefined;
  }

  async isManaged(providerId: string) {
    return Boolean(await this.getManaged(providerId));
  }

  /**
   * Rebuild the `keyVaults` map the legacy plane would have returned:
   * credential `values` with JSON-encoded entries expanded back.
   */
  private async credentialKeyVaults(anchor: ProviderBindingRow): Promise<Record<string, unknown>> {
    const reference = anchor.config?.secretReference;
    if (!reference) return {};
    const credential = await this.credentials.findPersonalById(
      reference.slice('credential:'.length),
    );
    if (!credential) return {};
    const payload = await this.credentials.decryptPayload(credential);
    if (!payload || typeof payload !== 'object' || !('values' in payload)) return {};
    return unflattenKeyVaults((payload as CredentialKVPayload).values ?? {});
  }

  materializeListItem(providerId: string, anchor: ProviderBindingRow): AiProviderListItem {
    const providerSettings = anchor.config?.providerSettings;
    return {
      description: providerSettings?.description,
      enabled: providerSettings?.enabled ?? false,
      id: providerId,
      logo: providerSettings?.logo,
      name: providerSettings?.name,
      sort: providerSettings?.sort,
      source: providerSettings?.source ?? (isBuiltinProvider(providerId) ? 'builtin' : 'custom'),
    };
  }

  async materializeDetail(
    providerId: string,
    anchor: ProviderBindingRow,
  ): Promise<AiProviderDetailItem> {
    const providerSettings = anchor.config?.providerSettings;
    return {
      checkModel: providerSettings?.checkModel,
      description: providerSettings?.description,
      enabled: providerSettings?.enabled ?? false,
      fetchOnClient: providerSettings?.fetchOnClient,
      id: providerId,
      keyVaults: await this.credentialKeyVaults(anchor),
      logo: providerSettings?.logo,
      name: providerSettings?.name ?? providerId,
      settings: (providerSettings?.settings ?? {}) as AiProviderSettings,
      source: providerSettings?.source ?? (isBuiltinProvider(providerId) ? 'builtin' : 'custom'),
    };
  }

  /**
   * The `runtimeConfig` fragment `AiInfraRepos.getAiProviderRuntimeState`
   * merges — keyVaults hydrate only on this local/execution surface, matching
   * what the legacy decryptor produced for the same scope.
   */
  async materializeRuntimeConfig(
    providerId: string,
    anchor: ProviderBindingRow,
  ): Promise<AiProviderRuntimeConfig> {
    const providerSettings = anchor.config?.providerSettings;
    return {
      config: providerSettings?.config ?? {},
      fetchOnClient: providerSettings?.fetchOnClient,
      keyVaults: (await this.credentialKeyVaults(anchor)) as Record<string, string>,
      settings: (providerSettings?.settings ?? {}) as AiProviderSettings,
    };
  }

  // ===== write plane =====

  private async upsertCredential(
    providerId: string,
    providerName: string | undefined,
    keyVaults: Record<string, unknown>,
    mode: 'merge' | 'replace' = 'merge',
  ) {
    const key = PROVIDER_CREDENTIAL_KEY(providerId);
    const existing = await this.credentials.findPersonalByKey(key);
    const values = flattenKeyVaults(keyVaults);

    if (existing) {
      // 'merge' keeps prior entries the patch never mentioned (P30's
      // `{...existing, ...patch}` semantics); 'replace' writes the snapshot
      // as-is so a patch's `undefined` values delete their keys.
      let merged = values;
      if (mode === 'merge') {
        const payload = await this.credentials.decryptPayload(existing);
        const previous =
          payload && typeof payload === 'object' && 'values' in payload
            ? ((payload as CredentialKVPayload).values ?? {})
            : {};
        merged = { ...previous, ...values };
      }
      await this.credentials.updatePersonal(existing.id, {
        payload: await this.credentials.encryptPayload({ values: merged }),
      });
      return existing;
    }

    return this.credentials.create({
      key,
      metadata: { providerBindingProviderId: providerId },
      name: providerName ?? providerId,
      payload: { values },
      type: 'kv-env',
    });
  }

  private async updateRow(row: ProviderBindingRow, patch: Partial<ProviderBindingConfig>) {
    if (!row.config) return;
    await this.bindings.update(row.id, row.revision, { ...row.config, ...patch });
  }

  private async rewriteAnchor(
    anchor: ProviderBindingRow | undefined,
    providerId: string,
    next: ProviderBindingConfig,
  ) {
    if (anchor) {
      await this.updateRow(anchor, next);
    } else {
      await this.bindings.create(next);
    }
  }

  /**
   * Model rows replicate the endpoint/credential/target so a resolved row is
   * self-contained for `resolveConnection`/`issueBindingExecution`.
   */
  private async propagateToModelRows(
    bound: BoundProvider,
    providerSettings: ProviderBindingProviderSettings,
  ) {
    const anchorConfig = bound.anchor?.config;
    if (!anchorConfig) return;
    const selection = buildSelection(providerSettings, anchorConfig.endpoint);

    for (const row of bound.models) {
      await this.updateRow(row, {
        enabled: false,
        endpoint: anchorConfig.endpoint,
        secretReference: anchorConfig.secretReference,
        providerSettings,
        selection,
      });
    }
  }

  /**
   * Legacy rows this caller's scope renders, on either provider table —
   * mirrors `buildWorkspaceWhere` (no visibility column): workspace scope is
   * the workspace's shared rows OR the caller's own unfiled rows; personal
   * scope is own unfiled rows only.
   */
  private legacyScope(table: typeof aiProviders | typeof aiModels) {
    const own = and(eq(table.userId, this.userId), isNull(table.workspaceId));
    return this.deps.workspaceId ? or(eq(table.workspaceId, this.deps.workspaceId), own) : own;
  }

  /**
   * Migrate-on-write: a provider's first binding write adopts the legacy
   * `ai_providers` row the caller can see — keyVaults into the credential,
   * provider fields into `providerSettings`. The caller's own unfiled row is
   * adopted and deleted (it is solely theirs); a shared workspace row only
   * seeds the binding — it stays so other members keep their provider.
   * Route rows materialize for the provider's current enabled-model set.
   */
  private async ensureAnchor(
    providerId: string,
    seed: { enabled?: boolean } = {},
  ): Promise<BoundProvider> {
    const managed = await this.getManaged(providerId);
    if (managed?.anchor) return managed;

    const decrypt: DecryptUserKeyVaults =
      this.deps.decryptLegacyKeyVaults ?? (async (s) => JSON.parse(s ?? '{}'));
    const ownLegacy = await this.db.query.aiProviders.findFirst({
      where: and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.userId, this.userId),
        isNull(aiProviders.workspaceId),
      ),
    });
    const legacy =
      ownLegacy ??
      (this.deps.workspaceId
        ? await this.db.query.aiProviders.findFirst({
            where: and(
              eq(aiProviders.id, providerId),
              eq(aiProviders.workspaceId, this.deps.workspaceId),
            ),
          })
        : undefined);

    let legacyKeyVaults: Record<string, unknown> = {};
    if (legacy?.keyVaults) {
      try {
        const decrypted = await decrypt(legacy.keyVaults);
        if (isRecord(decrypted)) legacyKeyVaults = decrypted;
      } catch {
        // Undecryptable legacy vaults migrate as an empty credential rather
        // than failing the write — the user re-enters the key.
        console.error(`[provider-bindings] failed to decrypt keyVaults for "${providerId}"`);
      }
    }

    const credential = await this.upsertCredential(
      providerId,
      legacy?.name ?? undefined,
      legacyKeyVaults,
    );

    const providerSettings: ProviderBindingProviderSettings = {
      checkModel: legacy?.checkModel ?? undefined,
      config: (legacy?.config as Record<string, unknown> | null | undefined) ?? undefined,
      description: legacy?.description ?? undefined,
      enabled: legacy?.enabled ?? seed.enabled ?? false,
      fetchOnClient: typeof legacy?.fetchOnClient === 'boolean' ? legacy.fetchOnClient : undefined,
      logo: legacy?.logo ?? undefined,
      name: legacy?.name ?? undefined,
      settings: (legacy?.settings as Record<string, unknown> | null | undefined) ?? undefined,
      sort: legacy?.sort ?? undefined,
      source:
        (legacy?.source as 'builtin' | 'custom' | undefined) ??
        (isBuiltinProvider(providerId) ? 'builtin' : 'custom'),
    };

    const endpoint = resolveEndpoint(providerId, legacyKeyVaults);
    await this.rewriteAnchor(undefined, providerId, {
      enabled: false,
      endpoint,
      model: PROVIDER_CONFIG_ANCHOR_MODEL,
      name: (providerSettings.name ?? providerId).slice(0, 120),
      provider: providerId,
      providerSettings,
      secretReference: secretReferenceOf(credential.id),
      selection: buildSelection(providerSettings, endpoint),
    });

    // Route rows materialize for the provider's existing enabled-model set.
    const enabledModelIds = (await this.deps.resolveEnabledModelIds?.(providerId)) ?? [];
    const selection = buildSelection(providerSettings, endpoint);
    for (const modelId of enabledModelIds) {
      await this.bindings.create({
        enabled: false,
        endpoint,
        model: modelId.slice(0, 200),
        name: `${providerId}/${modelId}`.slice(0, 120),
        provider: providerId,
        secretReference: secretReferenceOf(credential.id),
        selection,
      });
    }

    // Only the caller's own unfiled row is removed once its content is
    // fully expressed on the binding plane — a shared workspace row stays
    // for other members (this caller's binding simply wins in dual-read).
    if (ownLegacy) {
      await this.db
        .delete(aiProviders)
        .where(
          and(
            eq(aiProviders.id, providerId),
            eq(aiProviders.userId, this.userId),
            isNull(aiProviders.workspaceId),
          ),
        );
    }

    return (await this.getManaged(providerId))!;
  }

  async createProvider(input: CreateAiProviderParams): Promise<string> {
    const [managed, legacy] = await Promise.all([
      this.getManaged(input.id),
      this.db.query.aiProviders.findFirst({
        where: and(eq(aiProviders.id, input.id), this.legacyScope(aiProviders)),
      }),
    ]);
    if (managed || legacy) throw new ProviderBindingConflictError(input.id);

    const credential = await this.upsertCredential(input.id, input.name, input.keyVaults ?? {});
    const providerSettings: ProviderBindingProviderSettings = {
      config: input.config ?? undefined,
      description: input.description,
      enabled: true,
      logo: input.logo,
      name: input.name,
      settings: { ...input.settings, sdkType: input.sdkType },
      source: input.source,
    };
    const endpoint = resolveEndpoint(input.id, input.keyVaults ?? {});
    await this.rewriteAnchor(undefined, input.id, {
      enabled: false,
      endpoint,
      model: PROVIDER_CONFIG_ANCHOR_MODEL,
      name: input.name.slice(0, 120),
      provider: input.id,
      providerSettings,
      secretReference: secretReferenceOf(credential.id),
      selection: buildSelection(providerSettings, endpoint),
    });
    return input.id;
  }

  async updateProvider(id: string, value: UpdateAiProviderParams): Promise<void> {
    const bound = await this.ensureAnchor(id);
    const anchorConfig = bound.anchor!.config!;
    const previous = anchorConfig.providerSettings ?? { enabled: true };
    const settings = value.settings
      ? ({ ...previous.settings, ...value.settings } as Record<string, unknown>)
      : previous.settings;
    const providerSettings: ProviderBindingProviderSettings = {
      ...previous,
      ...(value.config !== undefined ? { config: { ...previous.config, ...value.config } } : {}),
      ...(value.description !== undefined ? { description: value.description ?? undefined } : {}),
      ...(value.logo !== undefined ? { logo: value.logo ?? undefined } : {}),
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(settings !== undefined ? { settings } : {}),
      ...(value.sdkType !== undefined ? { settings: { ...settings, sdkType: value.sdkType } } : {}),
    };

    await this.rewriteAnchor(bound.anchor, id, {
      ...anchorConfig,
      name: (providerSettings.name ?? anchorConfig.name).slice(0, 120),
      providerSettings,
    });
    await this.propagateToModelRows((await this.getManaged(id)) ?? bound, providerSettings);
    await this.verifyModels(id);
  }

  async updateProviderConfig(id: string, value: UpdateAiProviderConfigParams): Promise<void> {
    const bound = await this.ensureAnchor(id);
    const anchor = bound.anchor!;
    const previous = anchor.config?.providerSettings ?? { enabled: true };

    // Shallow-merge keyVaults like the legacy updateConfig: new values
    // override, fields absent from the patch are preserved.
    let keyVaults: Record<string, unknown> | undefined;
    if (value.keyVaults !== undefined) {
      const existing = await this.credentialKeyVaults(anchor);
      keyVaults = { ...existing, ...value.keyVaults };
    }

    const providerSettings: ProviderBindingProviderSettings = {
      ...previous,
      ...(value.checkModel !== undefined ? { checkModel: value.checkModel } : {}),
      ...(value.config !== undefined ? { config: { ...previous.config, ...value.config } } : {}),
      ...(typeof value.fetchOnClient === 'boolean' ? { fetchOnClient: value.fetchOnClient } : {}),
    };

    // Invalidate issued revisions before changing the shared credential.
    for (const row of bound.models) await this.updateRow(row, { enabled: false });

    const credential = keyVaults
      ? await this.upsertCredential(id, providerSettings.name, keyVaults, 'replace')
      : ((await this.credentials.findPersonalById(
          anchor.config!.secretReference.slice('credential:'.length),
        )) ?? (await this.upsertCredential(id, providerSettings.name, {})));

    const endpoint = keyVaults ? resolveEndpoint(id, keyVaults) : anchor.config!.endpoint;
    await this.rewriteAnchor(anchor, id, {
      ...anchor.config!,
      endpoint,
      name: (providerSettings.name ?? anchor.config!.name).slice(0, 120),
      providerSettings,
      secretReference: secretReferenceOf(credential.id),
    });
    await this.propagateToModelRows((await this.getManaged(id)) ?? bound, providerSettings);
    await this.verifyModels(id);
  }

  async setProviderEnabled(id: string, enabled: boolean): Promise<void> {
    const bound = await this.ensureAnchor(id, { enabled });
    const anchor = bound.anchor!;
    const providerSettings: ProviderBindingProviderSettings = {
      ...(anchor.config?.providerSettings ?? { enabled }),
      enabled,
    };

    await this.rewriteAnchor(anchor, id, {
      ...anchor.config!,
      providerSettings,
    });
    await this.propagateToModelRows((await this.getManaged(id)) ?? bound, providerSettings);
    await this.verifyModels(id);
  }

  async setProviderOrder(sortMap: { id: string; sort: number }[]): Promise<void> {
    for (const { id, sort } of sortMap) {
      const bound = await this.ensureAnchor(id, { enabled: true });
      const anchor = bound.anchor!;
      await this.rewriteAnchor(anchor, id, {
        ...anchor.config!,
        providerSettings: { ...(anchor.config?.providerSettings ?? { enabled: true }), sort },
      });
    }
  }

  async deleteProvider(id: string): Promise<void> {
    const bound = await this.getManaged(id);
    if (bound?.anchor) {
      // Delete the credential only when the plane created it and no other
      // provider's rows still reference it.
      const reference = bound.anchor.config?.secretReference;
      const rows = await this.bindings.list();
      for (const row of bound.models) await this.bindings.delete(row.id, row.revision);
      await this.bindings.delete(bound.anchor.id, bound.anchor.revision);

      if (reference) {
        const credentialId = reference.slice('credential:'.length);
        const credential = await this.credentials.findPersonalById(credentialId);
        const stillReferenced = rows.some(
          (row) => row.config?.provider !== id && row.config?.secretReference === reference,
        );
        if (credential?.metadata?.providerBindingProviderId === id && !stillReferenced) {
          await this.credentials.deletePersonal(credentialId);
        }
      }
    }

    // Erasure = both planes: drop every legacy provider row this scope
    // renders (shared workspace row + own unfiled rows, matching
    // AiProviderModel.delete semantics) in the same sweep.
    await this.db.transaction(async (trx) => {
      await trx
        .delete(aiModels)
        .where(and(eq(aiModels.providerId, id), this.legacyScope(aiModels)));
      await trx
        .delete(aiProviders)
        .where(and(eq(aiProviders.id, id), this.legacyScope(aiProviders)));
    });
  }

  /**
   * Mirror the model enable-set onto binding rows: enabling a model creates
   * its route row (armed when the provider is enabled), disabling deletes it.
   * The `ai_models` registry write happens in the caller — this only keeps the
   * resolvable route surface in sync for binding-managed providers.
   */
  async setModelEnabled(providerId: string, modelId: string, enabled: boolean): Promise<void> {
    await this.setModelsEnabled(providerId, [modelId], enabled);
  }

  private async verifyModels(providerId: string, modelIds?: string[]) {
    const bound = await this.getManaged(providerId);
    if (!bound?.anchor?.config.providerSettings?.enabled || !this.deps.verifyBindings) return;
    const rows = bound.models.filter(
      (row) =>
        (!modelIds || modelIds.includes(row.config.model)) &&
        row.config.selection.target === 'sandbox' &&
        row.config.endpoint !== PLACEHOLDER_ENDPOINT,
    );
    // A failed probe keeps the saved settings, but never makes the route selectable.
    if (rows.length) await this.deps.verifyBindings(rows).catch(() => undefined);
  }

  /** Mirror a batch enable-set write, then verify this provider once. */
  async setModelsEnabled(providerId: string, modelIds: string[], enabled: boolean): Promise<void> {
    const bound = await this.getManaged(providerId);
    if (!bound?.anchor?.config) return;
    const anchorConfig = bound.anchor.config;
    for (const modelId of new Set(modelIds)) {
      const row = bound.models.find((item) => item.config.model === modelId);
      if (!enabled) {
        if (row) await this.bindings.delete(row.id, row.revision);
      } else if (row) {
        await this.updateRow(row, { enabled: false });
      } else {
        const providerSettings = anchorConfig.providerSettings ?? { enabled: true };
        await this.bindings.create({
          enabled: false,
          endpoint: anchorConfig.endpoint,
          model: modelId.slice(0, 200),
          name: `${providerId}/${modelId}`.slice(0, 120),
          provider: providerId,
          secretReference: anchorConfig.secretReference,
          providerSettings,
          selection: buildSelection(providerSettings, anchorConfig.endpoint),
        });
      }
    }
    if (enabled) await this.verifyModels(providerId, modelIds);
  }

  /** Drop route rows for removed models (`removeAiModel`, `clearModels*`). */
  async removeModelBindings(providerId: string, modelIds?: string[]): Promise<void> {
    const bound = await this.getManaged(providerId);
    if (!bound) return;
    const drop = modelIds ? new Set(modelIds) : undefined;
    for (const row of bound.models) {
      if (drop && !drop.has(row.config?.model ?? '')) continue;
      await this.bindings.delete(row.id, row.revision);
    }
  }

  /**
   * Delete route rows for models that left the enabled set — used after
   * bulk registry mutations (`clearRemoteModels`) where the removed ids are
   * not reported by the caller.
   */
  async pruneModelBindings(providerId: string, keepModelIds: string[]): Promise<void> {
    const bound = await this.getManaged(providerId);
    if (!bound) return;
    const keep = new Set(keepModelIds);
    for (const row of bound.models) {
      if (!keep.has(row.config?.model ?? '')) {
        await this.bindings.delete(row.id, row.revision);
      }
    }
  }

  /**
   * Re-sync route rows against the registry's current enabled-model set —
   * drops rows for models a bulk registry mutation removed or disabled.
   * No-op for unmanaged providers.
   */
  async syncModelBindings(providerId: string): Promise<void> {
    const keepModelIds = (await this.deps.resolveEnabledModelIds?.(providerId)) ?? [];
    await this.pruneModelBindings(providerId, keepModelIds);
  }

  /**
   * Merge a keyVaults patch into the provider's credential — used by write
   * paths that mutate secrets outside the settings form (OAuth token refresh).
   * Returns false when the provider is not binding-managed so callers keep
   * their legacy write.
   */
  async updateProviderKeyVaults(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const bound = await this.getManaged(id);
    if (!bound?.anchor) return false;
    const existing = await this.credentialKeyVaults(bound.anchor);
    // Replace mode: an `undefined` in the patch deletes its key, matching
    // the legacy `{...keyVaults, ...patch}` + JSON.stringify drop semantics.
    await this.upsertCredential(
      id,
      bound.anchor.config?.name,
      { ...existing, ...patch },
      'replace',
    );
    return true;
  }
}

/**
 * Binding-preferred provider detail for personal scope — callers that hydrate
 * `keyVaults`/`settings` outside `AiInfraRepos` (`initModelRuntimeFromDB`, the
 * OAuth device-flow services) use this to read a migrated provider, and fall
 * back to `AiProviderModel.getAiProviderById` when it returns undefined.
 */
export const resolveBindingManagedProviderDetail = async (
  plane: ProviderBindingPlane,
  providerId: string,
): Promise<AiProviderDetailItem | undefined> => {
  const managed = await plane.getManaged(providerId);
  if (!managed?.anchor) return undefined;
  return plane.materializeDetail(providerId, managed.anchor);
};

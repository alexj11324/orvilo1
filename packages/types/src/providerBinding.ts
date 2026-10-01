import { z } from 'zod';

/**
 * Provider-level settings carried by binding rows written through the restored
 * provider settings surface (Phase 5b reconcile). One row per provider — the
 * "anchor" row whose `model` is the sentinel `PROVIDER_CONFIG_ANCHOR_MODEL` —
 * holds these fields; per-model rows replicate only the execution fields the
 * embedded resolver needs (`endpoint`, `secretReference`, `selection`,
 * `enabled`). Consumers that do not write the restored surface leave this
 * unset and see no behavior change.
 */
export const PROVIDER_CONFIG_ANCHOR_MODEL = '__provider_config__';

export const providerBindingProviderSettingsSchema = z
  .object({
    /** Provider check-model used by connectivity probes. */
    checkModel: z.string().max(200).optional(),
    /** Verbatim provider `config` blob (e.g. `enableResponseApi`). */
    config: z.object({ enableResponseApi: z.boolean().optional() }).passthrough().optional(),
    description: z.string().optional(),
    /** Provider enable switch; mirrored onto every model row's `enabled`. */
    enabled: z.boolean(),
    /** `fetchOnClient` — requests run from the client instead of the server. */
    fetchOnClient: z.boolean().optional(),
    logo: z.string().optional(),
    /** Display name (custom providers). */
    name: z.string().optional(),
    /** SDK adapter for custom providers (openai/anthropic/bedrock/...). */
    sdkType: z.string().max(64).optional(),
    /** `settings` blob — verbatim provider form-schema config. */
    settings: z.record(z.string(), z.unknown()).optional(),
    sort: z.number().optional(),
    source: z.enum(['builtin', 'custom']).optional(),
  })
  .strict();

export type ProviderBindingProviderSettings = z.infer<typeof providerBindingProviderSettingsSchema>;

export const providerBindingConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Restored-UI provider ids are user-entered strings (custom providers use
    // alphanumeric nanoids; builtin ids stay lowercase) — the strict slug
    // pattern forked them out of the binding plane entirely.
    provider: z.string().regex(/^[a-z0-9][\w-]{0,63}$/i),
    model: z.string().trim().min(1).max(200),
    endpoint: z
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && !url.search && !url.hash;
      }),
    secretReference: z.string().regex(/^credential:cred_[\w-]{1,200}$/),
    // Armed flag. `false` = saved-but-not-executable; provider-disable writes
    // `false` on every row so armed-path readers skip the provider.
    enabled: z.boolean().default(false),
    selection: z
      .object({
        runtime: z.enum(['orvilo', 'claude-code', 'codex']),
        engine: z.enum(['claude-sdk', 'codex-app-server']).optional(),
        effort: z
          .enum(['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
          .default('default'),
        mode: z.enum(['default', 'low', 'medium', 'high', 'ultra']).default('default'),
        speed: z.enum(['default', 'fast']).default('default'),
        target: z.enum(['local', 'device', 'sandbox']),
        deviceId: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .refine((value) => value.target !== 'device' || Boolean(value.deviceId)),
    providerSettings: providerBindingProviderSettingsSchema.optional(),
  })
  .strict()
  .refine(
    // Plain-http endpoints may only ride `local`/`device` targets — requests
    // then originate from the user's own host, where a LAN/loopback upstream
    // is a normal deployment. Sandbox-resolved bindings keep https-only so a
    // stored config can never push credentials over cleartext from the cloud.
    (config) =>
      config.selection.target !== 'sandbox' || new URL(config.endpoint).protocol === 'https:',
    { message: 'sandbox bindings require an https endpoint', path: ['endpoint'] },
  );

export type ProviderBindingConfig = z.infer<typeof providerBindingConfigSchema>;

/**
 * The shape actually persisted in `provider_bindings.config`. Writes through
 * {@link providerBindingConfigSchema} always land `enabled: false`; the server
 * flips `enabled` to true only after `checkConnection` verifies the binding
 * end-to-end, so stored rows may carry `enabled: true` even though the input
 * schema cannot express it.
 */
export interface StoredProviderBindingConfig extends Omit<ProviderBindingConfig, 'enabled'> {
  enabled: boolean;
}

export interface ProviderBinding extends StoredProviderBindingConfig {
  createdAt: Date;
  id: string;
  revision: number;
  updatedAt: Date;
}

import { z } from 'zod';

export const providerBindingConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    provider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    model: z.string().trim().min(1).max(200),
    endpoint: z
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        );
      }),
    secretReference: z.string().regex(/^credential:cred_[\w-]{1,200}$/),
    // Saving a configuration does not authorize runtime execution.
    enabled: z.literal(false).default(false),
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
  })
  .strict();

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

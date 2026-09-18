import type { HeterogeneousServerDefaultApiConfig } from '@orvilo/types';

/**
 * Session binding reference passed renderer → desktop main when a
 * heterogeneous agent runs under `authMode: 'api'`. User-provider (BYOK)
 * bindings are retired; the deployment-owned server-default relay is the only
 * supported kind.
 */
export type HeterogeneousProviderBindingReference = {
  apiConfig: HeterogeneousServerDefaultApiConfig;
  kind: 'server-default';
  /** Binding key stored with the native session that the renderer wants to resume. */
  resumeBindingKey?: string;
};

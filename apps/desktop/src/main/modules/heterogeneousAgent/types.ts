export interface HeterogeneousAgentImageAttachment {
  id: string;
  url: string;
}

export interface ProviderBindingFilePlan {
  content: string;
  /** Path relative to the host-owned profile or run directory. */
  path: string;
}

export interface PrepareServerDefaultBindingContext {
  args: string[];
  endpoint: string;
  env?: Record<string, string>;
  model: string;
  profileDir: string;
}

export interface ProviderBindingPlan {
  args: string[];
  /** Release transient resources created while preparing the binding. */
  cleanup?: () => Promise<void>;
  /** Best-effort synchronous release for app shutdown. */
  cleanupSync?: () => void;
  env: Record<string, string>;
  /** Environment variable that receives the per-prompt server operation token. */
  operationTokenEnvKey?: string;
  profileFiles?: ProviderBindingFilePlan[];
  runFiles?: ProviderBindingFilePlan[];
}

/**
 * Per-agent server-default binding composition. Every local agent executes
 * through an ACP v1 session (`spawnAgent` / `StandardAcpSession`), so process
 * argv + stream framing are no longer the driver's concern — a driver only
 * translates an Orvilo binding reference into the env vars, profile files, and
 * selector args the agent's ACP runtime understands. User-provider (BYOK)
 * bindings are retired; the deployment-owned server-default relay is the only
 * supported binding.
 */
export interface HeterogeneousAgentDriver {
  prepareServerDefaultBinding?: (
    context: PrepareServerDefaultBindingContext,
  ) => Promise<ProviderBindingPlan> | ProviderBindingPlan;
}

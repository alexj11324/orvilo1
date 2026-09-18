import type {
  HeterogeneousProviderBindingReference,
  HeterogeneousProviderBindingResolution,
} from '@orvilo/heterogeneous-agents';

export interface HeterogeneousAgentImageAttachment {
  id: string;
  url: string;
}

export interface ProviderBindingFilePlan {
  content: string;
  /** Path relative to the host-owned profile or run directory. */
  path: string;
}

export interface PrepareProviderBindingContext {
  args: string[];
  env?: Record<string, string>;
  profileDir: string;
  reference: Extract<HeterogeneousProviderBindingReference, { kind: 'provider' }>;
  resolution: HeterogeneousProviderBindingResolution;
  runDir: string;
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
 * Per-agent provider/server-default binding composition. Every local agent
 * executes through an ACP v1 session (`spawnAgent` / `StandardAcpSession`),
 * so process argv + stream framing are no longer the driver's concern — a
 * driver only translates a LobeHub binding reference into the env vars,
 * profile files, and selector args the agent's ACP runtime understands.
 */
export interface HeterogeneousAgentDriver {
  prepareProviderBinding?: (
    context: PrepareProviderBindingContext,
  ) => Promise<ProviderBindingPlan> | ProviderBindingPlan;
  prepareServerDefaultBinding?: (
    context: PrepareServerDefaultBindingContext,
  ) => Promise<ProviderBindingPlan> | ProviderBindingPlan;
}

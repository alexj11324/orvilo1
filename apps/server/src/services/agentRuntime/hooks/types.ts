/**
 * Agent Runtime Hooks — external lifecycle hook system
 *
 * Hook event types are defined in @orvilo/agent-runtime (shared).
 * Hook registration, webhook delivery, and serialization types are server-specific.
 */

import type { AgentHookEvent, AgentHookType } from '@orvilo/agent-runtime';
import type { AgentHookWebhookConfig, SerializedAgentHook } from '@orvilo/types';

export type {
  AfterCallAgentHookEvent,
  AfterCompactHookEvent,
  AfterHumanInterventionHookEvent,
  AfterToolCallHookEvent,
  AgentHookEvent,
  AgentHookType,
  AnyHookEvent,
  BeforeCallAgentHookEvent,
  BeforeCompactHookEvent,
  BeforeHumanInterventionHookEvent,
  BeforeToolCallObservationEvent,
  CallAgentErrorHookEvent,
  CompactErrorHookEvent,
  StopByHumanInterventionHookEvent,
  ToolCallErrorHookEvent,
  ToolCallHookEvent,
} from '@orvilo/agent-runtime';

// ── Server-side Hook Types ───────────────────────────────

/**
 * Webhook delivery configuration for production mode.
 *
 * Runtime-precise refinement of the serialized wire shape
 * ({@link AgentHookWebhookConfig} in `@orvilo/types`, used for persistence /
 * zod validation): the shared `body` / `delivery` / `url` are inherited, while
 * `eventFields` is narrowed to `keyof AgentHookEvent` and the server-only
 * `fallback` policy is added.
 */
export interface AgentHookWebhook extends Omit<AgentHookWebhookConfig, 'eventFields'> {
  /** Event fields to include in the webhook payload. Defaults to all serializable event fields. */
  eventFields?: (keyof AgentHookEvent)[];

  /**
   * Behavior when webhook delivery fails. Hatchet callbacks are always
   * restricted to the server's fixed internal handler allowlist.
   */
  fallback?: 'fetch' | 'none';
}

/**
 * Hook definition — consumers register these with execAgent
 */
export interface AgentHook {
  /** Handler function for local mode (called in-process) */
  handler: (event: AgentHookEvent) => Promise<void>;

  /** Unique hook identifier (for logging, debugging, idempotency) */
  id: string;

  /** Hook lifecycle point */
  type: AgentHookType;

  /** Webhook config for production mode (if omitted, hook only works in local mode) */
  webhook?: AgentHookWebhook;
}

// ── Serialized Hook (for Redis persistence) ──────────────

/**
 * Serialized hook config stored in AgentState.host.hooks (and on
 * `topic.metadata.runningOperation.hooks`). Only contains webhook info —
 * handler functions can't be serialized.
 *
 * Runtime-precise refinement of the wire shape ({@link SerializedAgentHook} in
 * `@orvilo/types`): `type` is narrowed to `AgentHookType` and `webhook` to
 * {@link AgentHookWebhook}. A persisted hook read back off topic metadata casts
 * up to this.
 */
export interface SerializedHook extends Omit<SerializedAgentHook, 'type' | 'webhook'> {
  type: AgentHookType;
  webhook: AgentHookWebhook;
}

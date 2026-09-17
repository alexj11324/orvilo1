import type { ToolRunResult } from '@orvilo/agent-runtime';
import type { SerializedAgentHook } from '@orvilo/types';
import debug from 'debug';
import urlJoin from 'url-join';

import { isHatchetWorkflowPath, triggerHatchetWorkflow } from '@/server/services/hatchet/workflows';
import { isQueueAgentRuntimeEnabled } from '@/server/services/queue/impls';

import type {
  AgentHook,
  AgentHookEvent,
  AgentHookType,
  AgentHookWebhook,
  AnyHookEvent,
  SerializedHook,
  ToolCallHookEvent,
} from './types';

const log = debug('orvilo-server:hook-dispatcher');

export class CriticalHookDeliveryError extends Error {
  constructor(
    public readonly hookId: string,
    public readonly cause: unknown,
  ) {
    super(`Critical webhook delivery failed: ${hookId}`, { cause });
    this.name = 'CriticalHookDeliveryError';
  }
}

/**
 * Delivers a webhook via explicit HTTP POST or a trusted in-worker callback.
 */
export async function deliverWebhook(
  webhook: AgentHookWebhook,
  payload: Record<string, unknown>,
): Promise<void> {
  const { url, delivery = 'fetch' } = webhook;

  // Resolve URL: relative paths joined with INTERNAL_APP_URL or APP_URL
  const resolvedUrl = url.startsWith('http')
    ? url
    : urlJoin(process.env.INTERNAL_APP_URL || process.env.APP_URL || '', url);

  // Operations started before the hard cut persisted `delivery: "qstash"` in
  // topic metadata. Route that legacy wire value through Hatchet as well so an
  // in-flight lifecycle callback cannot fall through to the retired HTTP route.
  const usesHatchet = delivery === 'hatchet' || (delivery as string) === 'qstash';
  if (usesHatchet) {
    const path = new URL(resolvedUrl, 'http://orvilo.internal').pathname;
    if (!isHatchetWorkflowPath(path)) {
      throw new Error(`Unsupported Hatchet internal webhook path: ${path}`);
    }
    const operationId = typeof payload.operationId === 'string' ? payload.operationId : 'global';
    await triggerHatchetWorkflow(path, payload, {
      // Lifecycle callbacks for one operation update shared thread/message
      // state. Keep them on one lane so a delayed step callback cannot land
      // after completion and replace terminal metadata with progress metadata.
      concurrencyKey: `hook.${operationId}`,
    });
    log('Webhook handed off to Hatchet: %s', path);
    return;
  }

  await fetchDeliver(resolvedUrl, payload);
}

async function fetchDeliver(url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  }
  log('Webhook delivered via fetch: %s (status: %d)', url, res.status);
}

function buildWebhookPayload(
  event: AnyHookEvent,
  eventFields?: (keyof AgentHookEvent)[],
): Record<string, unknown> {
  if (eventFields) {
    const payload: Record<string, unknown> = {};
    for (const field of eventFields) {
      if (field === 'finalState') continue;
      if (field in event) payload[field] = event[field as keyof AnyHookEvent];
    }
    return payload;
  }

  const payload = { ...event };
  if ('finalState' in payload) {
    delete (payload as { finalState?: unknown }).finalState;
  }
  return payload;
}

/**
 * HookDispatcher — central hub for registering and dispatching agent lifecycle hooks
 *
 * Local mode: hooks are stored in memory, handler functions called directly
 * Production mode: webhook configs persisted in AgentState.host.hooks,
 *   delivered via HTTP POST or an in-worker callback
 */
export class HookDispatcher {
  /**
   * In-memory hook store (local mode)
   * Maps operationId → AgentHook[]
   */
  private hooks: Map<string, AgentHook[]> = new Map();

  /**
   * Dispatch hooks for a given event type
   *
   * In local mode: calls handler functions from memory
   * In production mode: delivers webhooks from serialized config
   */
  async dispatch(
    operationId: string,
    type: AgentHookType,
    event: AnyHookEvent,
    /**
     * Hooks persisted on `state.host.hooks` (wire shape). Narrowed here to the
     * runtime-precise {@link SerializedHook} once the type / webhook are checked.
     */
    serializedHooks?: SerializedAgentHook[],
  ): Promise<void> {
    const isQueueMode = isQueueAgentRuntimeEnabled();

    if (!isQueueMode) {
      // Local mode: call handler functions directly
      const hooks = this.hooks.get(operationId)?.filter((h) => h.type === type) || [];

      for (const hook of hooks) {
        try {
          log('[%s][%s] Dispatching local hook: %s', operationId, type, hook.id);
          await hook.handler(event as AgentHookEvent);
        } catch (error) {
          log('[%s][%s] Hook error (non-fatal): %s %O', operationId, type, hook.id, error);
          // Hook errors should NOT affect main execution flow
        }
      }
    } else {
      // Production mode: deliver via webhooks
      const webhookHooks =
        serializedHooks?.filter(
          (h): h is SerializedHook => h.type === type && h.webhook !== undefined,
        ) ||
        this.getSerializedHooks(operationId)?.filter((h) => h.type === type) ||
        [];

      let criticalError: CriticalHookDeliveryError | undefined;
      for (const hook of webhookHooks) {
        try {
          log(
            '[%s][%s] Delivering webhook hook: %s → %s',
            operationId,
            type,
            hook.id,
            hook.webhook.url,
          );
          const webhookPayload = buildWebhookPayload(event, hook.webhook.eventFields);
          await deliverWebhook(hook.webhook, {
            ...webhookPayload,
            hookId: hook.id,
            hookType: type,
            ...hook.webhook.body,
          });
        } catch (error) {
          if (hook.webhook.fallback === 'none') {
            // No-fallback webhooks carry control flow (e.g. the sub-agent
            // resume bridge) — losing one strands its consumer, so surface
            // the failure in production logs, not just the debug namespace.
            console.error(
              `[HookDispatcher][${operationId}][${type}] Webhook delivery failed with no fallback: ${hook.id} → ${hook.webhook.url}`,
              error,
            );
            criticalError ??= new CriticalHookDeliveryError(hook.id, error);
          } else {
            log(
              '[%s][%s] Webhook delivery error (non-fatal): %s %O',
              operationId,
              type,
              hook.id,
              error,
            );
          }
        }
      }

      // Finish independent sibling hooks first, then fail the queue execution.
      // Queue runtimes can retry a lost control-flow handoff instead of
      // reporting success while stranding its consumer.
      if (criticalError) throw criticalError;
    }
  }

  /**
   * Dispatch beforeToolCall hooks with mock support.
   * Returns mock result if any handler called event.mock(), otherwise null.
   */
  async dispatchBeforeToolCall(
    operationId: string,
    event: Omit<ToolCallHookEvent, 'mock' | 'operationId'>,
  ): Promise<{
    isMocked: true;
    result: ToolRunResult;
  } | null> {
    const hooks = this.hooks.get(operationId)?.filter((h) => h.type === 'beforeToolCall') || [];
    if (hooks.length === 0) return null;

    let isMocked = false;
    let mockedResult: ToolRunResult | undefined;

    const toolCallEvent: ToolCallHookEvent = {
      ...event,
      mock: (result) => {
        if (isMocked) return false;
        isMocked = true;
        mockedResult = result;
        return true;
      },
      operationId,
    };

    for (const hook of hooks) {
      try {
        log('[%s][beforeToolCall] Dispatching: %s', operationId, hook.id);
        await hook.handler(toolCallEvent as any);
      } catch (error) {
        log('[%s][beforeToolCall] Hook error (non-fatal): %s %O', operationId, hook.id, error);
      }
      if (isMocked) break;
    }

    return isMocked && mockedResult ? { isMocked: true, result: mockedResult } : null;
  }

  /**
   * Get serialized hooks for an operation (for production mode persistence)
   */
  getSerializedHooks(operationId: string): SerializedHook[] | undefined {
    const hooks = this.hooks.get(operationId);
    if (!hooks) return undefined;

    return hooks
      .filter((h) => h.webhook)
      .map((h) => ({
        id: h.id,
        type: h.type,
        webhook: h.webhook!,
      }));
  }

  /**
   * Check if any hooks are registered for an operation
   */
  hasHooks(operationId: string): boolean {
    return (this.hooks.get(operationId)?.length ?? 0) > 0;
  }

  hasHook(operationId: string, hookId: string): boolean {
    return this.hooks.get(operationId)?.some((hook) => hook.id === hookId) ?? false;
  }

  /**
   * Register hooks for an operation
   *
   * In local mode: stores hooks in memory (including handler functions)
   * In production mode: caller should persist getSerializedHooks() to state.host.hooks
   */
  register(operationId: string, hooks: AgentHook[]): void {
    if (hooks.length === 0) return;

    const existing = this.hooks.get(operationId) || [];
    this.hooks.set(operationId, [...existing, ...hooks]);

    log(
      '[%s] Registered %d hooks: %s',
      operationId,
      hooks.length,
      hooks.map((h) => `${h.type}:${h.id}`).join(', '),
    );
  }

  /**
   * Unregister all hooks for an operation (cleanup)
   */
  unregister(operationId: string): void {
    this.hooks.delete(operationId);
    log('[%s] Unregistered all hooks', operationId);
  }
}

/**
 * Singleton instance — shared across the application
 */
export const hookDispatcher = new HookDispatcher();

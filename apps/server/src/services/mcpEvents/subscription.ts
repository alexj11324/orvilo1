import { randomUUID } from 'node:crypto';

import { isRecord } from '@orvilo/utils/object';

import type { McpEventsAdapter } from './adapter';
import { validateMcpSubscriptionArguments } from './adapter';
import type { McpEventBinding } from './deliveryTypes';
import type { McpEventDefinition, McpSubscribeResult } from './protocol';
import { createMcpSigningSecret } from './protocol';

export interface McpEventBindingScope {
  connectorId: string;
  tenantId: string;
}

/** Mutations are durable and atomic; callers must never use an in-memory production store. */
export interface McpEventBindingRepository {
  claimRefresh: (
    scope: McpEventBindingScope,
    id: string,
    now: number,
    leaseMs: number,
  ) => Promise<McpEventBinding | undefined>;
  createPending: (binding: McpEventBinding) => Promise<void>;
  get: (scope: McpEventBindingScope, id: string) => Promise<McpEventBinding | undefined>;
  listDue: (now: number) => Promise<McpEventBinding[]>;
  revoke: (scope: McpEventBindingScope, id: string, expectedRevision?: number) => Promise<boolean>;
  update: (
    scope: McpEventBindingScope,
    id: string,
    expectedState: 'pending' | 'active',
    patch: Partial<McpEventBinding>,
    expectedRevision?: number,
    cursorAtRequest?: string | null,
  ) => Promise<McpEventBinding | undefined>;
}

export interface CreateMcpEventSubscription extends McpEventBindingScope {
  arguments: Record<string, unknown>;
  event: McpEventDefinition;
  maxAgeMs?: number;
  schemaId: string;
  ttlMs?: number | null;
}

export interface McpSubscriptionDependencies {
  adapterFor: (scope: McpEventBindingScope) => Promise<McpEventsAdapter>;
  callbackUrl: (callbackToken: string) => string;
  /** Deployment maintenance interval plus processing margin; zero permits any live grant. */
  minimumRefreshWindowMs?: number;
  now?: () => number;
  repository: McpEventBindingRepository;
}

const ROTATION_GRACE_MS = 5 * 60_000;
const SUBSCRIBE_TIMEOUT_MS = 30_000;
const REFRESH_LEASE_MS = 60_000;

const isForbidden = (error: unknown) => isRecord(error) && error.code === -32012;
class McpSubscriptionContractError extends Error {}

/** Subscription IO only; event execution remains the existing scheduler's responsibility. */
export class McpEventSubscriptionService {
  private readonly now: () => number;

  constructor(private readonly dependencies: McpSubscriptionDependencies) {
    const minimumWindow = dependencies.minimumRefreshWindowMs ?? 0;
    if (!Number.isSafeInteger(minimumWindow) || minimumWindow < 0) {
      throw new Error('Invalid MCP subscription maintenance window');
    }
    this.now = dependencies.now ?? Date.now;
  }

  async create(input: CreateMcpEventSubscription): Promise<McpEventBinding> {
    if (!input.event.delivery.includes('webhook'))
      throw new Error('MCP event does not offer webhook delivery');
    validateMcpSubscriptionArguments(input.event, input.arguments);
    if (
      input.ttlMs !== undefined &&
      input.ttlMs !== null &&
      (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0)
    ) {
      throw new Error('Invalid MCP subscription ttlMs');
    }
    if (
      input.maxAgeMs !== undefined &&
      (!Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs < 0)
    ) {
      throw new Error('Invalid MCP subscription maxAgeMs');
    }
    const callbackToken = randomUUID();
    const callbackUrl = this.dependencies.callbackUrl(callbackToken);
    const url = new URL(callbackUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('MCP callback must be an HTTPS URL without credentials or fragment');
    }
    const binding: McpEventBinding = {
      callbackToken,
      callbackUrl,
      connectorId: input.connectorId,
      cursor: null,
      eventArguments: input.arguments,
      eventName: input.event.name,
      expiresAt: this.now() + REFRESH_LEASE_MS,
      id: randomUUID(),
      maxAgeMs: input.maxAgeMs,
      payloadSchema: input.event.payloadSchema,
      remoteSubscriptionId: null,
      revision: 0,
      schemaId: input.schemaId,
      signingKeys: [{ secret: createMcpSigningSecret() }],
      state: 'pending',
      tenantId: input.tenantId,
      truncated: false,
      ttlMs: input.ttlMs,
    };
    // Callback verification can be synchronous inside events/subscribe.
    await this.dependencies.repository.createPending(binding);
    try {
      return await this.subscribe(binding);
    } catch (error) {
      await this.dependencies.repository.revoke(input, binding.id);
      await this.cleanupFailedSubscription(binding, error);
      throw error;
    }
  }

  async refresh(
    scope: McpEventBindingScope,
    id: string,
    rotateKey = false,
  ): Promise<McpEventBinding> {
    const now = this.now();
    const binding = await this.dependencies.repository.claimRefresh(
      scope,
      id,
      now,
      REFRESH_LEASE_MS,
    );
    if (!binding) throw new Error('MCP subscription is inactive or already refreshing');
    let prepared = binding;
    if (rotateKey) {
      const signingKeys = [
        { secret: createMcpSigningSecret() },
        ...binding.signingKeys.filter((key) => key.expiresAt === undefined || key.expiresAt > now),
      ];
      const updated = await this.dependencies.repository.update(
        scope,
        id,
        'active',
        { signingKeys },
        binding.revision,
      );
      if (!updated) throw new Error('MCP subscription changed during key rotation');
      prepared = updated;
    }
    try {
      return await this.subscribe(prepared);
    } catch (error) {
      let shouldCleanup: boolean;
      if (isForbidden(error) || error instanceof McpSubscriptionContractError) {
        // A lease successor may already have refreshed. Only this revision can revoke.
        shouldCleanup = await this.dependencies.repository.revoke(scope, id, prepared.revision);
      } else {
        // The remote request can succeed even when its response is lost. Accept
        // both keys until a later refresh resolves which key the provider uses.
        await this.dependencies.repository.update(
          scope,
          id,
          'active',
          {
            refreshLeaseUntil: 0,
            ...(rotateKey
              ? {
                  signingKeys: [
                    ...binding.signingKeys.filter(
                      (key) => key.expiresAt === undefined || key.expiresAt > this.now(),
                    ),
                    ...prepared.signingKeys.slice(0, 1),
                  ],
                }
              : {}),
          },
          prepared.revision,
        );
        const latest = await this.dependencies.repository.get(scope, id);
        // A stop racing an already sent request still needs upstream cleanup.
        shouldCleanup = latest?.state === 'revoked';
      }
      if (shouldCleanup) await this.cleanupFailedSubscription(binding, error);
      throw error;
    }
  }

  async stop(scope: McpEventBindingScope, id: string): Promise<void> {
    const binding = await this.dependencies.repository.get(scope, id);
    if (!binding) return;
    // Disable ingress first even if upstream cleanup fails. Retain identity so
    // retrying stop can eagerly clean up an orphaned upstream subscription.
    await this.dependencies.repository.revoke(scope, id);
    await this.unsubscribe(binding);
  }

  /** Called by the existing maintenance scheduler; does not start a second runner. */
  async renewDue(now = this.now(), leadTimeMs = 60_000) {
    const due = await this.dependencies.repository.listDue(now + leadTimeMs);
    const outcomes: { id: string; status: 'refreshed' | 'revoked' | 'retry' }[] = [];
    for (const binding of due) {
      try {
        await this.refresh(binding, binding.id);
        outcomes.push({ id: binding.id, status: 'refreshed' });
      } catch {
        const current = await this.dependencies.repository.get(binding, binding.id);
        outcomes.push({
          id: binding.id,
          status: current?.state === 'revoked' ? 'revoked' : 'retry',
        });
      }
    }
    return outcomes;
  }

  private async subscribe(binding: McpEventBinding): Promise<McpEventBinding> {
    const adapter = await this.dependencies.adapterFor(binding);
    const result = await adapter.subscribe(
      {
        arguments: binding.eventArguments,
        cursor: binding.cursor,
        delivery: {
          mode: 'webhook',
          secret: binding.signingKeys[0].secret,
          url: binding.callbackUrl,
        },
        maxAgeMs: binding.maxAgeMs,
        name: binding.eventName,
        ttlMs: binding.ttlMs,
      },
      AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MS),
    );
    this.validateGrant(binding, result);
    if (binding.state === 'pending') {
      const verified = await this.dependencies.repository.get(binding, binding.id);
      if (verified?.state !== 'pending' || verified.remoteSubscriptionId !== result.id) {
        throw new McpSubscriptionContractError(
          'MCP callback was not verified for the returned subscription',
        );
      }
    }
    const now = this.now();
    const signingKeys = [
      { secret: binding.signingKeys[0].secret },
      ...binding.signingKeys
        .slice(1)
        .filter((key) => key.expiresAt === undefined || key.expiresAt > now)
        .map((key) => ({
          ...key,
          expiresAt: Math.min(key.expiresAt ?? Infinity, now + ROTATION_GRACE_MS),
        })),
    ];
    const updated = await this.dependencies.repository.update(
      binding,
      binding.id,
      binding.state === 'pending' ? 'pending' : 'active',
      {
        cursor: result.cursor,
        expiresAt: result.refreshBefore === null ? null : Date.parse(result.refreshBefore),
        remoteSubscriptionId: result.id,
        refreshLeaseUntil: 0,
        signingKeys,
        state: 'active',
        truncated: result.truncated,
      },
      binding.revision,
      binding.cursor,
    );
    if (!updated) throw new Error('MCP subscription changed while subscribing');
    return updated;
  }

  private async unsubscribe(binding: McpEventBinding) {
    const adapter = await this.dependencies.adapterFor(binding);
    await adapter.unsubscribe({
      arguments: binding.eventArguments,
      delivery: { mode: 'webhook', url: binding.callbackUrl },
      name: binding.eventName,
    });
  }

  private async cleanupFailedSubscription(binding: McpEventBinding, originalError: unknown) {
    try {
      // Subscribe may have committed remotely before its response was lost, or
      // stop may have raced it. Cleanup uses the original immutable identity.
      await this.unsubscribe(binding);
    } catch {
      throw new Error('MCP subscription failed; upstream cleanup requires retry', {
        cause: originalError,
      });
    }
  }

  private validateGrant(binding: McpEventBinding, result: McpSubscribeResult) {
    if (binding.remoteSubscriptionId && binding.remoteSubscriptionId !== result.id) {
      throw new McpSubscriptionContractError('MCP subscription ID changed across refresh');
    }
    if (result.refreshBefore === null && binding.ttlMs !== null) {
      throw new McpSubscriptionContractError(
        'MCP provider granted unrequested non-expiring subscription',
      );
    }
    if (result.refreshBefore !== null) {
      const remaining = Date.parse(result.refreshBefore) - this.now();
      if (remaining <= 0) {
        throw new McpSubscriptionContractError(
          'MCP provider returned an expired subscription grant',
        );
      }
      if (remaining <= (this.dependencies.minimumRefreshWindowMs ?? 0)) {
        throw new McpSubscriptionContractError(
          'MCP subscription grant is shorter than the deployment maintenance window',
        );
      }
    }
  }
}

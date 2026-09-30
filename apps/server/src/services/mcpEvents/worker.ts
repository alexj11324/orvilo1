import type { EventDispatchAdmission } from '@orvilo/agent-execution/controlPlane';

import type { McpEventInbox } from './deliveryTypes';
import type { SqlMcpEventWorkRepository } from './workerRepository';

/** Canonical port — see @orvilo/agent-execution/controlPlane contracts. */
export type { EventDispatchAdmission };
export type { EventDispatchAdmission as McpEventDispatchAdmission };

const metaString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** Called by the existing maintenance scheduler, never a second task runner. */
export class McpEventWorker {
  constructor(
    private readonly dependencies: {
      inbox: McpEventInbox;
      repository: SqlMcpEventWorkRepository;
      admission?: EventDispatchAdmission;
      now?: () => number;
      leaseMs?: number;
      maxAttempts?: number;
    },
  ) {}

  async pump(input: { limit?: number; tenantId?: string } = {}) {
    // Deployment readiness is not a poison-message failure: leave receipts queued.
    if (!this.dependencies.admission) return { claimed: 0, completed: 0, retried: 0 };
    const now = this.dependencies.now ?? Date.now;
    const deliveries = await this.dependencies.inbox.claim(
      now(),
      this.dependencies.leaseMs ?? 60_000,
      input.limit ?? 20,
      input.tenantId,
    );
    let completed = 0;
    let retried = 0;
    for (const delivery of deliveries) {
      let retry = false;
      let waiting = false;
      let errorCode = 'admission_unavailable';
      try {
        const runs = await this.dependencies.repository.prepare(delivery, now());
        for (const run of runs) {
          if (run.status !== 'pending') continue;
          if (!(await this.dependencies.repository.current(delivery, run, now()))) {
            await this.dependencies.repository.settle(delivery, run, now(), {
              status: 'denied',
              reason: 'stale_binding',
            });
            continue;
          }
          const trigger = run.trigger;
          const result = this.dependencies.admission
            ? await this.dependencies.admission.admit({
                causationId: metaString(delivery.event._meta?.causationId),
                eventId: delivery.event.eventId,
                idempotencyKey: run.idempotencyKey,
                inboxRef: delivery.id,
                rootDispatchId: metaString(delivery.event._meta?.rootDispatchId),
                schemaVersion: 1,
                sourceId: trigger.sourceId,
                subscriptionId: delivery.subscriptionId,
                taskId: trigger.taskId,
                tenantId: trigger.tenantId,
                triggerId: trigger.id,
                triggerRevision: trigger.revision,
                userId: trigger.userId,
                workspaceId: trigger.workspaceId,
              })
            : { status: 'waiting' as const, reason: 'runtime-unavailable', retryable: true };
          if (result.status === 'waiting' && result.retryable) {
            retry = true;
            waiting = true;
            continue;
          }
          const saved = await this.dependencies.repository.settle(
            delivery,
            run,
            now(),
            result.status === 'accepted' || result.status === 'duplicate'
              ? { status: 'accepted', dispatchId: result.dispatchId }
              : { status: 'denied', reason: result.reason },
          );
          if (!saved) {
            retry = true;
            errorCode = 'lease_lost';
          }
        }
      } catch {
        // Exceptions can follow a committed core dispatch. Replay keeps the same key.
        retry = true;
        errorCode = 'admission_interrupted';
        waiting = false;
      }
      const settled = await this.dependencies.inbox.settle(
        delivery.id,
        delivery.leaseToken!,
        now(),
        retry
          ? {
              status:
                !waiting && delivery.attempts >= (this.dependencies.maxAttempts ?? 10)
                  ? 'dead'
                  : 'pending',
              preserveAttempts: waiting,
              availableAt: now() + Math.min(300_000, 1000 * 2 ** Math.min(delivery.attempts, 8)),
              errorCode,
            }
          : { status: 'completed' },
      );
      if (settled) {
        if (retry) retried++;
        else completed++;
      }
    }
    return { claimed: deliveries.length, completed, retried };
  }
}

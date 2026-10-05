import type { EventDispatchAdmission } from '@orvilo/agent-execution/controlPlane';

import type { McpEventInbox, McpInboxDelivery } from './deliveryTypes';
import type { SqlMcpEventWorkRepository } from './workerRepository';

/** Canonical port — see @orvilo/agent-execution/controlPlane contracts. */
export type { EventDispatchAdmission };
export type { EventDispatchAdmission as McpEventDispatchAdmission };

const metaString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** Durable ingress consumer; execution always uses the existing admission/runner. */
export class McpEventWorker {
  constructor(
    private readonly dependencies: {
      inbox: McpEventInbox;
      repository: SqlMcpEventWorkRepository;
      admission?: EventDispatchAdmission;
      now?: () => number;
      leaseMs?: number;
      maxAttempts?: number;
      concurrency?: number;
      maxProcessingMs?: number;
      maxWaitingMs?: number;
    },
  ) {}

  async pump(input: { limit?: number; tenantId?: string } = {}) {
    // Deployment readiness is not a poison-message failure: leave receipts queued.
    if (!this.dependencies.admission) return { claimed: 0, completed: 0, retried: 0 };
    const now = this.dependencies.now ?? Date.now;
    const maxProcessingMs = this.dependencies.maxProcessingMs ?? 10 * 60_000;
    if (!Number.isSafeInteger(maxProcessingMs) || maxProcessingMs < 1)
      throw new Error('Invalid inbox processing deadline');
    const pumpDeadline = now() + maxProcessingMs;
    const limit = input.limit ?? 20;
    const concurrency = this.dependencies.concurrency ?? 4;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 8
    )
      throw new Error('Invalid inbox pump limits');
    let reserved = 0;
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    // Claim only when a slot is ready. A slow device never ages the lease of
    // unstarted siblings in a preclaimed batch, and other slots keep moving.
    await Promise.all(
      Array.from({ length: Math.min(concurrency, limit) }, async () => {
        while (reserved < limit && now() < pumpDeadline) {
          reserved++;
          const [delivery] = await this.dependencies.inbox.claim(
            now(),
            this.dependencies.leaseMs ?? 60_000,
            1,
            input.tenantId,
          );
          if (!delivery) break;
          claimed++;
          const outcome = await this.process(delivery, now, pumpDeadline);
          if (outcome === 'completed') completed++;
          if (outcome === 'retried') retried++;
          // Do not immediately reclaim a receipt whose ownership we just lost.
          if (outcome === 'lease_lost') break;
        }
      }),
    );
    return { claimed, completed, retried };
  }

  private async process(delivery: McpInboxDelivery, now: () => number, deadline: number) {
    const leaseMs = this.dependencies.leaseMs ?? 60_000;
    const maxProcessingMs = Math.max(1, deadline - now());
    let leaseActive = true;
    let stopped = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const renew = async () => {
      try {
        if (stopped || now() >= deadline) {
          leaseActive = false;
          return;
        }
        const renewed = await this.dependencies.inbox.renew(
          delivery.id,
          delivery.leaseToken!,
          now(),
          leaseMs,
        );
        leaseActive = !stopped && now() < deadline && renewed;
      } catch {
        leaseActive = false;
      }
    };
    const scheduleRenewal = () => {
      timer = setTimeout(
        () => {
          void renew().then(() => {
            if (!stopped && leaseActive) scheduleRenewal();
          });
        },
        Math.max(1, Math.floor(leaseMs / 3)),
      );
      timer.unref?.();
    };
    scheduleRenewal();
    const work = async () => {
      // Waiting for a device/admission is recoverable, but never unbounded.
      // Keep the original receipt for operator inspection and explicit replay.
      if (now() - delivery.receivedAt >= (this.dependencies.maxWaitingMs ?? 24 * 60 * 60_000)) {
        const expired = await this.dependencies.inbox.settle(
          delivery.id,
          delivery.leaseToken!,
          now(),
          { status: 'dead', availableAt: now(), errorCode: 'waiting_timeout' },
        );
        return expired ? ('retried' as const) : ('lease_lost' as const);
      }
      let retry = false;
      let waiting = false;
      let errorCode = 'admission_unavailable';
      try {
        const runs = await this.dependencies.repository.prepare(delivery, now());
        for (const run of runs) {
          if (!leaseActive || now() >= deadline) break;
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
            errorCode = result.reason.replaceAll('-', '_');
            continue;
          }
          if (!leaseActive || now() >= deadline) break;
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
      if (!leaseActive || now() >= deadline) return 'lease_lost';
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
      return settled
        ? retry
          ? ('retried' as const)
          : ('completed' as const)
        : ('lease_lost' as const);
    };
    try {
      return await Promise.race([
        work(),
        new Promise<'lease_lost'>((resolve) => {
          deadlineTimer = setTimeout(() => {
            leaseActive = false;
            resolve('lease_lost');
          }, maxProcessingMs);
          deadlineTimer.unref?.();
        }),
      ]);
    } finally {
      stopped = true;
      leaseActive = false;
      if (timer) clearTimeout(timer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
    }
  }
}

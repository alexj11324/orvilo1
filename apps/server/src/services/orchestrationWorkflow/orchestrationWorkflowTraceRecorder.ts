import {
  appendAdvanceToPartial,
  buildOrchestrationWorkflowTraceRollup,
  finalizeOrchestrationWorkflowTrace,
  type IOrchestrationWorkflowTraceStore,
  type OrchestrationWorkflowAdvanceTrigger,
  type OrchestrationWorkflowTrajectory,
  type RecordTickInput,
} from '@orvilo/agent-tracing';
import debug from 'debug';
import { sql } from 'drizzle-orm';

import { OrchestrationWorkflowTraceModel } from '@/database/models/orchestrationWorkflowTrace';
import type { OrviloDatabase } from '@/database/type';
import {
  buildOrchestrationWorkflowTraceKey,
  buildOrchestrationWorkflowTracePartialKey,
} from '@/server/modules/OrchestrationWorkflowTracing';

import type { OrchestrationWorkflowTickObservation } from './traceObservation';
import { createDefaultOrchestrationWorkflowTraceStore } from './traceStore';

const log = debug('orvilo-server:orchestration-workflow-trace');

/**
 * Advisory-lock namespace, so a orchestration workflow's trace lock cannot collide with another
 * feature's. `0x676f_616c` is ASCII `orchestrationWorkflow`, and fits int4.
 */
const ORCHESTRATION_WORKFLOW_TRACE_LOCK_NAMESPACE = 0x67_6f_61_6c;

/**
 * Collects one advance's ticks and writes them into the orchestration workflow's trajectory.
 *
 * Recording is best-effort by construction: a orchestration workflow that cannot be traced must
 * still advance. Every write is caught here so a storage outage degrades
 * observability instead of stalling long-horizon orchestration workflows — the same posture the
 * operation snapshot recorder takes.
 */
export class OrchestrationWorkflowAdvanceRecorder {
  private readonly startedAt = Date.now();
  private readonly ticks: RecordTickInput[] = [];
  private readonly operationIds = new Set<string>();

  constructor(
    private readonly db: OrviloDatabase,
    private readonly orchestrationWorkflowId: string,
    private readonly trigger: OrchestrationWorkflowAdvanceTrigger,
    private readonly store: IOrchestrationWorkflowTraceStore | null = createDefaultOrchestrationWorkflowTraceStore(),
  ) {}

  get enabled(): boolean {
    return this.store !== null;
  }

  /** Pass to `OrchestrationWorkflowService.tick`; undefined when tracing is off, so tick skips recording. */
  get onDecision(): ((observation: OrchestrationWorkflowTickObservation) => void) | undefined {
    if (!this.store) return undefined;
    return (observation) => {
      const { effects, graphState, ...rest } = observation;
      for (const effect of effects) {
        if (effect.operationId) this.operationIds.add(effect.operationId);
      }
      this.ticks.push({ ...rest, effects, graphState });
    };
  }

  async flush(error?: unknown): Promise<void> {
    if (!this.store || this.ticks.length === 0) return;

    try {
      await this.serializedPerOrchestrationWorkflow(async (tx) => {
        const trajectory = await appendAdvanceToPartial(this.store!, this.orchestrationWorkflowId, {
          childOperationIds: [...this.operationIds],
          error: error
            ? { message: error instanceof Error ? error.message : String(error), type: 'advance' }
            : undefined,
          startedAt: this.startedAt,
          ticks: this.ticks,
          trigger: this.trigger,
        });
        if (trajectory) await this.writeObservationRow(trajectory, tx);
      });
    } catch (writeError) {
      log('failed to record advance for %s: %O', this.orchestrationWorkflowId, writeError);
    }
  }

  /**
   * Run the trajectory write under a per-orchestration workflow advisory lock.
   *
   * Appending is read-modify-write on one object, and advances for the same
   * orchestration workflow genuinely overlap — an event hook, a manual nudge and the sweep can
   * all be in flight at once, which the coordinator handles everywhere else by
   * claiming rows. Without serialization two advances read the same partial,
   * pick the same `seq`, and the second write silently erases the first; the
   * stale rollup then overwrites the row and `advancesTotal` goes backwards.
   *
   * The lock is transaction-scoped, so it releases on commit or on any failure,
   * and it is held across the object write — which is the point: reading the
   * partial and writing it back have to be one critical section. That keeps a
   * transaction open for one storage round trip, which is the cost of the
   * trajectory being complete.
   */
  private async serializedPerOrchestrationWorkflow<T>(
    run: (tx: OrviloDatabase) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${ORCHESTRATION_WORKFLOW_TRACE_LOCK_NAMESPACE}, hashtext(${this.orchestrationWorkflowId}))`,
      );
      return run(tx as unknown as OrviloDatabase);
    });
  }

  /**
   * Re-derive the observation row from the whole trajectory on every advance.
   *
   * Rewriting rather than incrementing is what makes it exact however often it
   * runs — an advance can be retried by the queue, and an additive counter
   * would drift. It also keeps the row queryable while the orchestration workflow is still
   * running, which is when a stalling orchestration workflow is worth finding.
   */
  private async writeObservationRow(
    trajectory: OrchestrationWorkflowTrajectory,
    tx: OrviloDatabase = this.db,
  ): Promise<void> {
    const rollup = buildOrchestrationWorkflowTraceRollup(trajectory);

    await new OrchestrationWorkflowTraceModel(tx).upsert({
      advancesByOutcome: rollup.advancesByOutcome,
      advancesByTrigger: rollup.advancesByTrigger,
      advancesTotal: rollup.advancesTotal,
      completedAt: rollup.completedAt ? new Date(rollup.completedAt) : null,
      finalStatus: rollup.completionReason ?? null,
      findingsTotal: rollup.findingsTotal,
      gatesOpened: rollup.gatesOpened,
      gatesResolved: rollup.gatesResolved,
      orchestrationWorkflowId: this.orchestrationWorkflowId,
      humanWaitingMs: rollup.humanWaitingMs,
      nodesTotal: rollup.nodesTotal,
      startedAt: new Date(rollup.startedAt),
      ticksByBranch: rollup.ticksByBranch,
      ticksTotal: rollup.ticksTotal,
      // Whichever object exists *now*. Writing the finalized key from the
      // first advance made `hasTrace` a lie for every running orchestration workflow and had the
      // server sign a URL that 404s — so a orchestration workflow could not be inspected until it
      // was over, which is the opposite of the intent.
      traceS3Key: trajectory.completionReason
        ? buildOrchestrationWorkflowTraceKey(this.orchestrationWorkflowId)
        : buildOrchestrationWorkflowTracePartialKey(this.orchestrationWorkflowId),
      workOperations: rollup.operationsTotal,
      // Columns kept as shipped. The node kind is now `task`, but renaming
      // three columns on a live table buys nothing the reporting names above
      // do not already give — so the mapping lives here, in one place.
      workResolved: rollup.tasksCompleted,
      workRetired: rollup.tasksRetired,
    });
  }

  /**
   * Close the trajectory once the orchestration workflow itself is terminal. A orchestration workflow that is only
   * parked keeps its partial, which readers still serve — an unfinished
   * long-horizon orchestration workflow is the normal thing to inspect.
   */
  async finalize(completionReason: string): Promise<void> {
    if (!this.store) return;
    try {
      await this.serializedPerOrchestrationWorkflow(async (tx) => {
        const trajectory = await finalizeOrchestrationWorkflowTrace(
          this.store!,
          this.orchestrationWorkflowId,
          { completionReason },
        );
        if (trajectory) await this.writeObservationRow(trajectory, tx);
      });
    } catch (error) {
      log('failed to finalize trajectory for %s: %O', this.orchestrationWorkflowId, error);
    }
  }
}

/** Orchestration workflow statuses that end a trajectory. `paused` is a stop, not an end. */
export const TERMINAL_ORCHESTRATION_WORKFLOW_STATUSES = new Set(['achieved', 'failed', 'canceled']);

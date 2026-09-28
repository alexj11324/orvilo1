import type { AgentState } from '@orvilo/agent-execution';
import debug from 'debug';
import { and, eq, gt } from 'drizzle-orm';

import {
  deriveAgentInterventionQueueDeduplicationId,
  matchesAgentInterventionContinuationProvenance,
} from '@/business/server/agent-run/agentInterventionIdentity';
import { agentInterventions } from '@/database/schemas/agentIntervention';

import type { AgentExecutionServiceDeps, PendingInterventionsResult } from './types';

const log = debug('orvilo-server:intervention-service');

/**
 * Human-intervention (approval) surface.
 *
 * Split out of the legacy AgentRuntime facade. Under ACP the durable
 * `agent_interventions` rows (status 'pending', unexpired) are the source of
 * truth — hetero runs don't write `waiting_for_human` state snapshots. A
 * single-operation read additionally merges a legacy snapshot entry so an
 * in-flight pre-migration op keeps reporting.
 */
export class InterventionService {
  private readonly agentOperationModel: AgentExecutionServiceDeps['agentOperationModel'];
  private readonly serverDB: AgentExecutionServiceDeps['serverDB'];
  private readonly stateManager: AgentExecutionServiceDeps['stateManager'];
  private readonly workspaceId?: string;

  constructor(deps: AgentExecutionServiceDeps) {
    this.agentOperationModel = deps.agentOperationModel;
    this.serverDB = deps.serverDB;
    this.stateManager = deps.stateManager;
    this.workspaceId = deps.workspaceId;
  }

  /** Load the authoritative runtime state for a deterministic intervention continuation. */
  async loadInterventionContinuationState(operationId: string): Promise<AgentState | null> {
    return this.stateManager.loadAgentState(operationId);
  }

  /**
   * Verify that a prepared intervention continuation has actually been
   * dispatched. Under ACP there is no step queue: `dispatchHeteroAgent`
   * writes the durable `agent_operations` row and flips it past 'idle' at
   * recordStart, so a post-'idle' row IS the dispatch proof (the queue-ACK
   * `agentInterventionDispatch` marker has no ACP writer — it was only
   * stamped by the retired schedule path).
   *
   * A row still 'idle' means the continuation was prepared but never
   * dispatched (engine-era leftover or a crashed dispatch); there is no
   * server-side way to start it — report 'missing' so callers fail closed
   * instead of re-queueing a step nobody will run.
   */
  async ensureInterventionContinuationStarted(
    operationId: string,
  ): Promise<'already_started' | 'missing' | 'scheduled'> {
    const state = await this.stateManager.loadAgentState(operationId);
    if (!state) return 'missing';

    const provenance = state.origin?.continuation as
      | {
          resolutionRequestId?: unknown;
          sourceOperationId?: unknown;
          sourceToolMessageIds?: unknown;
        }
      | undefined;
    const preparation = state.metadata?.agentInterventionPreparation as
      | {
          deduplicationId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
          stepIndex?: unknown;
        }
      | undefined;
    if (
      typeof provenance?.resolutionRequestId !== 'string' ||
      typeof provenance.sourceOperationId !== 'string' ||
      !Array.isArray(provenance.sourceToolMessageIds) ||
      !provenance.sourceToolMessageIds.every((id) => typeof id === 'string')
    ) {
      throw new Error(`Intervention continuation provenance missing: ${operationId}`);
    }
    if (
      preparation?.state !== 'ready' ||
      preparation.resolutionRequestId !== provenance.resolutionRequestId ||
      typeof preparation.stepIndex !== 'number' ||
      !Number.isSafeInteger(preparation.stepIndex) ||
      preparation.stepIndex < 0
    ) {
      throw new Error(`Intervention continuation is not ready to schedule: ${operationId}`);
    }
    const stepIndex = preparation.stepIndex;
    const deduplicationId = deriveAgentInterventionQueueDeduplicationId(operationId, stepIndex);
    if (preparation.deduplicationId !== deduplicationId) {
      throw new Error(`Intervention continuation dedupe provenance conflict: ${operationId}`);
    }
    const operation = await this.agentOperationModel.findById(operationId);
    if (
      !operation ||
      !matchesAgentInterventionContinuationProvenance(
        operation.metadata?.agentInterventionContinuation,
        provenance as {
          resolutionRequestId: string;
          sourceOperationId: string;
          sourceToolMessageIds: string[];
        },
      )
    ) {
      throw new Error(`Intervention continuation durable provenance conflict: ${operationId}`);
    }
    const durablePreparation = operation.metadata?.agentInterventionPreparation as
      | {
          deduplicationId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
          stepIndex?: unknown;
        }
      | undefined;
    if (
      durablePreparation &&
      (durablePreparation.state !== 'ready' ||
        durablePreparation.resolutionRequestId !== provenance.resolutionRequestId ||
        durablePreparation.stepIndex !== stepIndex ||
        durablePreparation.deduplicationId !== deduplicationId)
    ) {
      throw new Error(`Intervention continuation durable preparation conflict: ${operationId}`);
    }
    if (!durablePreparation) {
      const persisted = await this.agentOperationModel.recordAgentInterventionPreparation(
        operationId,
        {
          deduplicationId,
          resolutionRequestId: provenance.resolutionRequestId,
          state: 'ready',
          stepIndex,
        },
      );
      if (!persisted) {
        throw new Error(`Failed to backfill intervention preparation: ${operationId}`);
      }
    }
    const dispatchMarker = operation.metadata?.agentInterventionDispatch as
      | {
          deduplicationId?: unknown;
          messageId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
        }
      | undefined;
    if (dispatchMarker) {
      if (
        dispatchMarker.state !== 'scheduled' ||
        dispatchMarker.resolutionRequestId !== provenance.resolutionRequestId ||
        dispatchMarker.deduplicationId !== deduplicationId
      ) {
        throw new Error(`Intervention continuation dispatch marker conflict: ${operationId}`);
      }
      return 'already_started';
    }

    // No queue ACK marker and no step queue: the durable op row's post-'idle'
    // status is the only remaining dispatch proof. 'idle' means prepared but
    // never dispatched — unrecoverable server-side under ACP, so report
    // 'missing' and let the caller rebuild the continuation through execAgent.
    return operation.status === 'idle' ? 'missing' : 'already_started';
  }

  /**
   * List pending human interventions. Under ACP the durable
   * `agent_interventions` rows (status 'pending', unexpired) are the source of
   * truth — hetero runs don't write `waiting_for_human` state snapshots. For a
   * single `operationId` we additionally merge a legacy snapshot entry if one
   * still exists, so an in-flight pre-migration op keeps reporting.
   */
  async getPendingInterventions(params: {
    operationId?: string;
    userId?: string;
  }): Promise<PendingInterventionsResult> {
    const { operationId, userId } = params;

    try {
      log('Getting pending interventions for operationId: %s, userId: %s', operationId, userId);

      const pendingInterventions: PendingInterventionsResult['pendingInterventions'] = [];
      const seenOperations = new Set<string>();

      // Durable rows — the ACP source of truth.
      const conditions = [eq(agentInterventions.status, 'pending')];
      if (operationId) {
        conditions.push(eq(agentInterventions.operationId, operationId));
      } else if (userId) {
        conditions.push(eq(agentInterventions.userId, userId));
        if (this.workspaceId) {
          conditions.push(eq(agentInterventions.workspaceId, this.workspaceId));
        }
      }
      conditions.push(gt(agentInterventions.deadline, new Date()));

      const rows = await this.serverDB
        .select()
        .from(agentInterventions)
        .where(and(...conditions));

      const rowsByOperation = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = rowsByOperation.get(row.operationId) ?? [];
        list.push(row);
        rowsByOperation.set(row.operationId, list);
      }

      const metas = new Map<string, { modelRuntimeConfig?: unknown; userId?: string } | null>();
      for (const [opId, opRows] of rowsByOperation) {
        let metadata = metas.get(opId);
        if (metadata === undefined) {
          metadata = await this.stateManager.getOperationMetadata(opId).catch(() => null);
          metas.set(opId, metadata);
        }
        seenOperations.add(opId);
        for (const row of opRows) {
          pendingInterventions.push({
            lastModified: row.updatedAt.toISOString(),
            modelRuntimeConfig: metadata?.modelRuntimeConfig,
            operationId: row.operationId,
            pendingToolsCalling:
              row.interactionKind === 'tool_approval'
                ? [
                    {
                      apiName: row.sanitizedRequest.apiName ?? row.canonicalToolKey ?? '',
                      id: row.toolCallId,
                      identifier: row.sanitizedRequest.identifier ?? row.canonicalToolKey ?? '',
                      type: 'default',
                    },
                  ]
                : undefined,
            pendingHumanPrompt:
              row.interactionKind === 'tool_approval' ? undefined : row.sanitizedRequest,
            status: 'waiting_for_human',
            stepCount: row.stepIndex,
            type: row.interactionKind === 'tool_approval' ? 'tool_approval' : 'human_prompt',
            userId: row.userId,
          });
        }
      }

      // Legacy snapshot merge (single-op reads only): a pre-ACP run parked at
      // waiting_for_human carries no durable rows, so keep reporting it.
      if (operationId && !seenOperations.has(operationId)) {
        try {
          const [state, metadata] = await Promise.all([
            this.stateManager.loadAgentState(operationId),
            this.stateManager.getOperationMetadata(operationId),
          ]);

          if (state?.status === 'waiting_for_human') {
            const intervention: PendingInterventionsResult['pendingInterventions'][number] = {
              lastModified: state.lastModified,
              modelRuntimeConfig: metadata?.modelRuntimeConfig,
              operationId,
              status: state.status,
              stepCount: state.stepCount,
              type: 'tool_approval',
              userId: metadata?.userId,
            };
            if (state.pendingToolsCalling) {
              intervention.type = 'tool_approval';
              intervention.pendingToolsCalling = state.pendingToolsCalling;
            } else if (state.pendingHumanPrompt) {
              intervention.type = 'human_prompt';
              intervention.pendingHumanPrompt = state.pendingHumanPrompt;
            } else if (state.pendingHumanSelect) {
              intervention.type = 'human_select';
              intervention.pendingHumanSelect = state.pendingHumanSelect;
            }
            pendingInterventions.push(intervention);
          }
        } catch (error) {
          log('Failed to get state for operation %s: %O', operationId, error);
        }
      }

      return {
        pendingInterventions,
        timestamp: new Date().toISOString(),
        totalCount: pendingInterventions.length,
      };
    } catch (error) {
      log('Failed to get pending interventions: %O', error);
      throw error;
    }
  }
}

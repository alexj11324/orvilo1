import { type AgentState, isParkedStatus } from '@orvilo/agent-execution';
import debug from 'debug';

import { loadRemoteExecutionStatus } from '@/server/services/heterogeneousAgent/runAdmission';

import type { AgentExecutionServiceDeps, OperationStatusResult } from './types';

const log = debug('orvilo-server:operation-status');

/**
 * Operation status queries (state snapshots + remote admission ledger).
 *
 * Split out of the legacy AgentRuntime facade: reads the state-manager
 * snapshot + metadata, and — for remote/hetero runs — the durable
 * remote-admission ledger so a finished run keeps a truthful status surface
 * after its state snapshot expires.
 */
export class OperationStatusService {
  private readonly serverDB: AgentExecutionServiceDeps['serverDB'];
  private readonly stateManager: AgentExecutionServiceDeps['stateManager'];
  private readonly streamManager: AgentExecutionServiceDeps['streamManager'];

  constructor(deps: AgentExecutionServiceDeps) {
    this.serverDB = deps.serverDB;
    this.stateManager = deps.stateManager;
    this.streamManager = deps.streamManager;
  }

  /**
   * Generic state snapshot lookup — null for ACP-era hetero runs, which never
   * write a state blob (their durable op row + remote admission ledger are the
   * source of truth; see {@link getOperationStatus}).
   */
  async loadAgentState(operationId: string): Promise<AgentState | null> {
    return this.stateManager.loadAgentState(operationId);
  }

  /**
   * Get operation status. Reads the state-manager snapshot + metadata, and —
   * for remote/hetero runs — the durable remote-admission ledger so a finished
   * run keeps a truthful status surface after its state snapshot expires.
   */
  async getOperationStatus(params: {
    historyLimit?: number;
    includeHistory?: boolean;
    operationId: string;
  }): Promise<OperationStatusResult | null> {
    const { operationId, includeHistory = false, historyLimit = 10 } = params;

    try {
      log('Getting operation status for %s', operationId);

      const [currentState, operationMetadata, remoteExecution] = await Promise.all([
        this.stateManager.loadAgentState(operationId),
        this.stateManager.getOperationMetadata(operationId),
        loadRemoteExecutionStatus(this.serverDB, this.streamManager, operationId).catch((error) => {
          log('Failed to load remote execution status for %s: %O', operationId, error);
          return undefined;
        }),
      ]);

      // Operation may have expired or does not exist — unless a
      // remote-admitted run is still in flight. Its device writes through
      // ingest/finish callbacks, not a local state snapshot, so the durable
      // admission ledger is the remaining source of truth a reconnect polls.
      if (!currentState || !operationMetadata) {
        if (!remoteExecution) {
          log('Operation %s not found (may have expired)', operationId);
          return null;
        }

        // The admission ledger is not settled on normal completion — a
        // finished remote run keeps `state: 'running'` while only the durable
        // operation row carries the terminal status. Derive liveness from
        // both, or a completed run would report `running` forever.
        const durableStatus = remoteExecution.durableStatus;
        const durableTerminal = ['abandoned', 'done', 'error', 'interrupted'].includes(
          durableStatus ?? '',
        );
        const remoteActive =
          !durableTerminal && !['offline', 'rejected'].includes(remoteExecution.admission.state);
        const status = remoteActive
          ? 'running'
          : durableTerminal
            ? (durableStatus as 'abandoned' | 'done' | 'error' | 'interrupted')
            : 'error';

        return {
          currentState: {
            lastModified: remoteExecution.admission.updatedAt,
            status,
            stepCount: 0,
          },
          hasError: status === 'error',
          isActive: remoteActive,
          isCompleted: status === 'done',
          metadata: {},
          needsHumanInput: false,
          operationId,
          remoteExecution,
          stats: {
            lastActiveTime: 0,
            totalCost: 0,
            totalMessages: 0,
            totalSteps: 0,
            uptime: 0,
          },
        };
      }

      let executionHistory;
      if (includeHistory) {
        try {
          executionHistory = await this.stateManager.getExecutionHistory(operationId, historyLimit);
        } catch (error) {
          log('Failed to load execution history: %O', error);
          executionHistory = [];
        }
      }

      let recentEvents;
      if (includeHistory) {
        try {
          recentEvents = await this.streamManager.getStreamHistory(operationId, 20);
        } catch (error) {
          log('Failed to load recent events: %O', error);
          recentEvents = [];
        }
      }

      const stats = {
        lastActiveTime: operationMetadata.lastActiveAt
          ? Date.now() - new Date(operationMetadata.lastActiveAt).getTime()
          : 0,
        totalCost: currentState.cost?.total || 0,
        totalMessages: currentState.messages?.length || 0,
        totalSteps: currentState.stepCount || 0,
        uptime: operationMetadata.createdAt
          ? Date.now() - new Date(operationMetadata.createdAt).getTime()
          : 0,
      };

      return {
        currentState: {
          cost: currentState.cost,
          costLimit: currentState.costLimit,
          error: currentState.error,
          interruption: currentState.interruption,
          lastModified: currentState.lastModified,
          maxSteps: currentState.maxSteps,
          pendingHumanPrompt: currentState.pendingHumanPrompt,
          pendingHumanSelect: currentState.pendingHumanSelect,
          pendingToolsCalling: currentState.pendingToolsCalling,
          status: currentState.status,
          stepCount: currentState.stepCount,
          usage: currentState.usage,
        },
        executionHistory: executionHistory?.slice(0, historyLimit),
        hasError: currentState.status === 'error',
        isActive: currentState.status === 'running' || isParkedStatus(currentState.status),
        isCompleted: currentState.status === 'done',
        metadata: operationMetadata,
        needsHumanInput: currentState.status === 'waiting_for_human',
        operationId,
        recentEvents: recentEvents?.slice(0, 10),
        remoteExecution,
        stats,
      };
    } catch (error) {
      log('Failed to get operation status for %s: %O', operationId, error);
      throw error;
    }
  }
}

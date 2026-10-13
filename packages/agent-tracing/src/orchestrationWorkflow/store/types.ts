import type { OrchestrationWorkflowTraceSummary, OrchestrationWorkflowTrajectory } from '../types';

/**
 * Storage for orchestration workflow trajectories. Mirrors `ISnapshotStore`: a finalized object
 * per orchestration workflow plus an in-progress partial, because a orchestration workflow is advanced from many
 * separate requests and has to accumulate across them.
 */
export interface IOrchestrationWorkflowTraceStore {
  get: (orchestrationWorkflowId: string) => Promise<OrchestrationWorkflowTrajectory | null>;
  list: (options?: { limit?: number }) => Promise<OrchestrationWorkflowTraceSummary[]>;
  listPartials: () => Promise<string[]>;
  loadPartial: (
    orchestrationWorkflowId: string,
  ) => Promise<Partial<OrchestrationWorkflowTrajectory> | null>;
  removePartial: (orchestrationWorkflowId: string) => Promise<void>;
  save: (trajectory: OrchestrationWorkflowTrajectory) => Promise<void>;
  savePartial: (
    orchestrationWorkflowId: string,
    partial: Partial<OrchestrationWorkflowTrajectory>,
  ) => Promise<void>;
}

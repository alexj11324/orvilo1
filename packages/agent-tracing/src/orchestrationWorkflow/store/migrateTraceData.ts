import type { OrchestrationWorkflowTrajectory } from '../types';

/** Upgrade persisted trace data; these legacy keys are storage formats, never API aliases. */
export function migrateOrchestrationWorkflowTraceData<
  T extends Partial<OrchestrationWorkflowTrajectory>,
>(value: T): T {
  const data = value as T & { goalId?: string };
  if (data.goalId !== undefined) {
    data.orchestrationWorkflowId ??= data.goalId;
    delete data.goalId;
  }
  const migrateGraph = (graph: unknown) => {
    if (!graph || typeof graph !== 'object') return;
    const state = graph as Record<string, unknown>;
    if ('goal' in state) {
      state.orchestrationWorkflow ??= state.goal;
      delete state.goal;
    }
    for (const node of (state.nodes ?? state.nodesUpserted ?? []) as Array<{ title: string }>) {
      if (node.title === 'Complete full Goal acceptance')
        node.title = 'Complete full Orchestration workflow acceptance';
    }
  };
  migrateGraph(data.graphBaseline);
  for (const advance of data.advances ?? []) {
    for (const tick of advance.ticks) {
      migrateGraph(tick.graphDelta);
      for (const task of [
        ...(tick.candidateTasks ?? []),
        ...(tick.frontierTask ? [tick.frontierTask] : []),
      ]) {
        if (task.error === 'Goal Task operation lease expired.')
          task.error = 'Orchestration workflow Task operation lease expired.';
      }
      if ((tick.branch as string) === 'goal_paused') tick.branch = 'orchestration_workflow_paused';
      if ((tick.branch as string) === 'goal_terminal')
        tick.branch = 'orchestration_workflow_terminal';
      for (const effect of tick.effects) {
        if ((effect.type as string) === 'goal_status')
          effect.type = 'orchestration_workflow_status';
      }
    }
  }
  return data;
}

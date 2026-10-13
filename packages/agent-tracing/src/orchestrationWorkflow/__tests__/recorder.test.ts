import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendAdvanceToPartial,
  finalizeOrchestrationWorkflowTrace,
  type RecordTickInput,
} from '../recorder';
import type { IOrchestrationWorkflowTraceStore } from '../store/types';
import type {
  OrchestrationWorkflowGraphState,
  OrchestrationWorkflowTraceSummary,
  OrchestrationWorkflowTrajectory,
} from '../types';
import { graph, node } from './fixtures';

class MemoryStore implements IOrchestrationWorkflowTraceStore {
  partials = new Map<string, Partial<OrchestrationWorkflowTrajectory>>();
  saved = new Map<string, OrchestrationWorkflowTrajectory>();

  async get(orchestrationWorkflowId: string) {
    return this.saved.get(orchestrationWorkflowId) ?? null;
  }
  async list(): Promise<OrchestrationWorkflowTraceSummary[]> {
    return [];
  }
  async listPartials() {
    return [...this.partials.keys()];
  }
  async loadPartial(orchestrationWorkflowId: string) {
    return this.partials.get(orchestrationWorkflowId) ?? null;
  }
  async removePartial(orchestrationWorkflowId: string) {
    this.partials.delete(orchestrationWorkflowId);
  }
  async save(trajectory: OrchestrationWorkflowTrajectory) {
    this.saved.set(trajectory.orchestrationWorkflowId, trajectory);
  }
  async savePartial(
    orchestrationWorkflowId: string,
    partial: Partial<OrchestrationWorkflowTrajectory>,
  ) {
    this.partials.set(orchestrationWorkflowId, partial);
  }
}

const tick = (graphState: OrchestrationWorkflowGraphState, at = 0): RecordTickInput => ({
  at,
  branch: 'dispatch_task',
  budget: { costLimitReached: false, roundLimitReached: false, runs: 0, totalCost: 0 },
  candidates: [],
  effects: [],
  graphState,
  message: 'ok',
  outcome: 'advanced',
});

describe('appendAdvanceToPartial', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it('seeds the baseline from the first tick and leaves its delta empty', async () => {
    const state = graph({ nodes: [node('a')] });

    const trajectory = await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
      startedAt: 0,
      ticks: [tick(state)],
      trigger: 'create',
    });
    const advance = trajectory?.advances.at(-1);

    expect(advance?.seq).toBe(0);
    expect(advance?.ticks[0].graphDelta).toBeUndefined();
    expect(store.partials.get('orchestration_workflow_1')?.graphBaseline).toEqual(state);
  });

  it('diffs each tick against the previous recorded state, across advances', async () => {
    const first = graph({ nodes: [node('a')] });
    const second = graph({ nodes: [node('a', { status: 'active' })] });
    const third = graph({ nodes: [node('a', { status: 'resolved' })] });

    await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
      startedAt: 0,
      ticks: [tick(first), tick(second)],
      trigger: 'create',
    });
    const next = (
      await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
        startedAt: 5,
        ticks: [tick(third)],
        trigger: 'settle',
      })
    )?.advances.at(-1);

    expect(next?.seq).toBe(1);
    expect(next?.ticks[0].graphDelta).toEqual({
      nodesUpserted: [node('a', { status: 'resolved' })],
    });
  });

  it('captures a graph edit made between two advances', async () => {
    await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
      startedAt: 0,
      ticks: [tick(graph({ nodes: [node('a')] }))],
      trigger: 'create',
    });

    // A task node added from the UI, with no advance in between.
    const withExtra = graph({ nodes: [node('a'), node('b')] });
    const next = (
      await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
        startedAt: 5,
        ticks: [tick(withExtra)],
        trigger: 'manual',
      })
    )?.advances.at(-1);

    expect(next?.ticks[0].graphDelta).toEqual({ nodesUpserted: [node('b')] });
  });

  it('records nothing for an advance that ran no ticks', async () => {
    expect(
      await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
        startedAt: 0,
        ticks: [],
        trigger: 'sweep',
      }),
    ).toBeNull();
    expect(store.partials.size).toBe(0);
  });

  it('computes shape per tick', async () => {
    const advance = (
      await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
        startedAt: 0,
        ticks: [tick(graph({ nodes: [node('a'), node('b', { kind: 'finding' })] }))],
        trigger: 'create',
      })
    )?.advances.at(-1);

    expect(advance?.ticks[0].graphShape).toMatchObject({
      findings: 1,
      nodesTotal: 2,
      tasksOpen: 1,
    });
  });
});

describe('finalizeOrchestrationWorkflowTrace', () => {
  it('moves the partial into a finalized trajectory', async () => {
    const store = new MemoryStore();
    await appendAdvanceToPartial(store, 'orchestration_workflow_1', {
      startedAt: 0,
      ticks: [tick(graph({ nodes: [node('a')] }))],
      trigger: 'create',
    });

    const trajectory = await finalizeOrchestrationWorkflowTrace(store, 'orchestration_workflow_1', {
      completedAt: 99,
      completionReason: 'achieved',
    });

    expect(trajectory).toMatchObject({
      completedAt: 99,
      completionReason: 'achieved',
      orchestrationWorkflowId: 'orchestration_workflow_1',
      totalAdvances: 1,
      totalTicks: 1,
    });
    expect(store.partials.size).toBe(0);
    expect(await store.get('orchestration_workflow_1')).not.toBeNull();
  });

  it('is a no-op when the orchestration workflow never recorded anything', async () => {
    expect(
      await finalizeOrchestrationWorkflowTrace(new MemoryStore(), 'orchestration_workflow_x', {
        completionReason: 'failed',
      }),
    ).toBeNull();
  });
});

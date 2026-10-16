import type { GoalGraphSnapshot } from '@orvilo/types';
import { describe, expect, it, vi } from 'vitest';

import { experimentResults, exploreGraph } from './exploreGraph';

const claim = vi.hoisted(() => vi.fn());
vi.mock('@/database/models/goalExploration', () => ({
  GoalExplorationModel: class {
    claim = claim;
  },
  goalExplorationSnapshot: () => 'snapshot',
}));

const graph = {
  goal: {
    id: 'old-goal',
    config: { exploration: { instruction: 'Old exploration', maxExperiments: 3 } },
  },
  edges: [
    { kind: 'revises', sourceNodeId: 'fix', targetNodeId: 'parent' },
    { kind: 'produces', sourceNodeId: 'fix', targetNodeId: 'result' },
  ],
  nodes: [
    { id: 'parent', kind: 'experiment', status: 'resolved', title: 'Original experiment' },
    { id: 'fix', kind: 'task', status: 'resolved', title: 'Correction' },
    {
      id: 'result',
      kind: 'finding',
      status: 'resolved',
      title: 'Result',
      description: 'Recorded evidence',
    },
  ],
} as unknown as GoalGraphSnapshot;

describe('retired Goal graph exploration', () => {
  it('rejects before persisting a planning claim', async () => {
    await expect(
      exploreGraph({ db: {} as never, effects: [], graph, userId: 'owner' }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(claim).not.toHaveBeenCalled();
  });
  it('retains corrected experiment evidence as historical facts', () => {
    expect(experimentResults(graph, 'parent')).toEqual(['Result\nRecorded evidence']);
  });
});

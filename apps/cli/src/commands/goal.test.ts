import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerGoalCommand } from './goal';

const mocks = vi.hoisted(() => ({ graph: vi.fn(), supervision: vi.fn(), list: vi.fn() }));
vi.mock('../api/client', () => ({
  getTrpcClient: async () => ({
    goal: {
      graph: { query: mocks.graph },
      supervision: { query: mocks.supervision },
      list: { query: mocks.list },
    },
  }),
}));

afterEach(() => vi.restoreAllMocks());

const program = () => {
  const p = new Command();
  p.exitOverride();
  registerGoalCommand(p);
  return p;
};

describe('Goal archive CLI', () => {
  it('registers only historical reads', () => {
    expect(program().commands[0].commands.map((command) => command.name())).toEqual([
      'list',
      'show',
      'graph',
      'supervision',
      'decisions',
    ]);
  });
  it('reads the original graph and decision ledger', async () => {
    const print = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.graph.mockResolvedValue({
      data: {
        goal: { id: 'goal-archive' },
        nodes: [],
        edges: [],
        events: [],
        decisions: [{ id: 'decision-1', status: 'resolved' }],
      },
    });
    await program().parseAsync(['node', 'test', 'goal', 'show', 'goal-archive', '--json']);
    expect(mocks.graph).toHaveBeenCalledWith({ id: 'goal-archive' });
    expect(print).toHaveBeenCalledWith(expect.stringContaining('goal-archive'));
    await program().parseAsync(['node', 'test', 'goal', 'decisions', 'goal-archive', '--json']);
    expect(print).toHaveBeenLastCalledWith(expect.stringContaining('decision-1'));
  });
});

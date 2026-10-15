import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  advanceGoal: vi.fn(),
  create: vi.fn(),
  scheduleGoalAdvance: vi.fn(),
}));

vi.mock('@/server/services/goal', () => ({
  GoalService: vi.fn(function () {
    return { create: mocks.create };
  }),
}));
vi.mock('@/server/services/goal/advanceGoal', () => ({ advanceGoal: mocks.advanceGoal }));
vi.mock('@/server/services/goal/scheduler', () => ({
  scheduleGoalAdvance: mocks.scheduleGoalAdvance,
}));

const { goalRuntime } = await import('../goal');

const runtime = () =>
  goalRuntime.factory({
    agentId: 'agt_1',
    serverDB: {} as never,
    toolManifestMap: {},
    userId: 'user-1',
    workspaceId: 'ws-1',
  } as never);

const args = {
  criteria: [{ title: 'It works' }],
  instruction: 'do the thing',
  name: 'A goal',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ goal: { id: 'goal_1', title: 'A goal' } });
});

describe('goalRuntime.createGoal', () => {
  it('does not create or start a standalone Goal', async () => {
    const result = await runtime().createGoal(args);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.scheduleGoalAdvance).not.toHaveBeenCalled();
    expect(mocks.advanceGoal).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.content).toBe(
      'Standalone Goal execution is unavailable; use an Issue plan and Checklist',
    );
  });
});

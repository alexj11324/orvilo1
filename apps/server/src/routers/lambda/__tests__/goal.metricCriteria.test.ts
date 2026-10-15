// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission: vi.fn(function () {
    return (opts: any) => opts.next({ ctx: opts.ctx });
  }),
}));

vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async (importOriginal) => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  return { ...(await importOriginal<object>()), wsCompatProcedure: authedProcedure };
});

// Router contract tests do not launch an Agent runtime.
vi.mock('@/server/services/aiAgent', () => ({ AiAgentService: vi.fn() }));

const mockCreate = vi.fn();
const mockSetMetricCriteria = vi.fn();
const mockRecordObservation = vi.fn();
const mockFindById = vi.fn();
const mockGraph = vi.fn();

vi.mock('@/server/services/goal', () => ({
  GoalService: vi.fn(function () {
    return {
      create: mockCreate,
      graph: mockGraph,
      recordObservation: mockRecordObservation,
      setMetricCriteria: mockSetMetricCriteria,
    };
  }),
}));

vi.mock('@/database/models/goal', () => ({
  GoalModel: vi.fn(function () {
    return { findById: mockFindById };
  }),
}));

const mockScheduleGoalAdvance = vi.fn();
vi.mock('@/server/services/goal/scheduler', () => ({
  scheduleGoalAdvance: mockScheduleGoalAdvance,
}));

const { goalRouter } = await import('../goal');

describe('goalRouter retired numeric acceptance', () => {
  const ctx: any = { serverDB: {}, userId: 'user-1', workspaceId: null };
  const caller = goalRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      'create',
      () => caller.create({ title: 'Retired goal', config: { manager: { maxTurns: 5 } } }),
    ],
    [
      'setMetricCriteria',
      () =>
        caller.setMetricCriteria({
          id: 'goal_1',
          metrics: [{ key: 'churn', op: 'lte', target: 5 }],
          mode: 'merge',
        }),
    ],
    [
      'recordObservation',
      () => caller.recordObservation({ id: 'goal_1', key: 'followers', value: 1200 }),
    ],
  ] as const)('rejects %s without writing or scheduling execution', async (_name, invoke) => {
    await expect(invoke()).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSetMetricCriteria).not.toHaveBeenCalled();
    expect(mockRecordObservation).not.toHaveBeenCalled();
    expect(mockScheduleGoalAdvance).not.toHaveBeenCalled();
  });

  it('retains historical graph reads', async () => {
    const graph = { goal: { id: 'goal_1' }, nodes: [], edges: [] };
    mockGraph.mockResolvedValue(graph);
    await expect(caller.graph({ id: 'goal_1' })).resolves.toEqual({ data: graph, success: true });
    expect(mockScheduleGoalAdvance).not.toHaveBeenCalled();
  });
});

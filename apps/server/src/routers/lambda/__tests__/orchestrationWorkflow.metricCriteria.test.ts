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

vi.mock('@/server/services/orchestrationWorkflow', () => ({
  OrchestrationWorkflowService: vi.fn(function () {
    return {
      create: mockCreate,
      recordObservation: mockRecordObservation,
      setMetricCriteria: mockSetMetricCriteria,
    };
  }),
}));

vi.mock('@/database/models/orchestrationWorkflow', () => ({
  OrchestrationWorkflowModel: vi.fn(function () {
    return { findById: mockFindById };
  }),
}));

const mockScheduleOrchestrationWorkflowAdvance = vi.fn();
vi.mock('@/server/services/orchestrationWorkflow/scheduler', () => ({
  scheduleOrchestrationWorkflowAdvance: mockScheduleOrchestrationWorkflowAdvance,
}));

const { orchestrationWorkflowRouter } = await import('../orchestrationWorkflow');

describe('orchestrationWorkflowRouter numeric acceptance', () => {
  const ctx: any = { serverDB: {}, userId: 'user-1', workspaceId: null };
  const caller = orchestrationWorkflowRouter.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ orchestrationWorkflow: { id: 'orchestration_workflow_1' } });
    mockFindById.mockResolvedValue({ id: 'orchestration_workflow_1', userId: 'user-1' });
    mockSetMetricCriteria.mockResolvedValue({
      orchestrationWorkflow: { id: 'orchestration_workflow_1' },
    });
    mockRecordObservation.mockResolvedValue({ point: {}, series: {}, shouldAdvance: true });
  });

  it('accepts planning limits without a separately configured manager identity', async () => {
    await caller.create({
      agentId: 'task-worker',
      createdByAgentId: 'creating-agent',
      config: { manager: { maxTurns: 5 } },
      title: 'Creator-managed orchestration workflow',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByAgentId: 'creating-agent',
        config: { manager: { maxTurns: 5 } },
      }),
    );
  });

  it('carries measured clauses through the create contract', async () => {
    // Zod strips unknown keys, so a clause absent from the schema would reach
    // the service as `undefined` and leave the gate unreachable in production
    // while the service-level tests still passed.
    await caller.create({
      config: { acceptance: { metrics: [{ key: 'followers', target: 1_000_000 }] } },
      title: 'Grow the account',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { acceptance: { metrics: [{ key: 'followers', target: 1_000_000 }] } },
      }),
    );
  });

  it('declares clauses after creation, defaulting to replace mode', async () => {
    await caller.setMetricCriteria({
      id: 'orchestration_workflow_1',
      metrics: [{ key: 'churn', op: 'lte', target: 5 }],
    });

    expect(mockSetMetricCriteria).toHaveBeenCalledWith(
      'orchestration_workflow_1',
      [{ key: 'churn', op: 'lte', target: 5 }],
      undefined,
    );
  });

  it('passes merge mode through, so single-clause declares upsert server-side', async () => {
    await caller.setMetricCriteria({
      id: 'orchestration_workflow_1',
      metrics: [{ key: 'churn', op: 'lte', target: 5 }],
      mode: 'merge',
    });

    expect(mockSetMetricCriteria).toHaveBeenCalledWith(
      'orchestration_workflow_1',
      [{ key: 'churn', op: 'lte', target: 5 }],
      'merge',
    );
  });

  it('rejects a comparison the evaluator does not implement', async () => {
    await expect(
      caller.setMetricCriteria({
        id: 'orchestration_workflow_1',
        metrics: [{ key: 'churn', op: 'approx' as never, target: 5 }],
      }),
    ).rejects.toThrow();
    expect(mockSetMetricCriteria).not.toHaveBeenCalled();
  });

  describe('recordObservation', () => {
    it('wakes the coordinator when the measurement cleared the gate', async () => {
      await caller.recordObservation({
        id: 'orchestration_workflow_1',
        key: 'followers',
        value: 1200,
      });

      expect(mockRecordObservation).toHaveBeenCalledWith('orchestration_workflow_1', {
        key: 'followers',
        value: 1200,
      });
      expect(mockScheduleOrchestrationWorkflowAdvance).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationWorkflowId: 'orchestration_workflow_1',
          trigger: 'observe',
        }),
      );
    });

    it('does not queue an advance a parked orchestration workflow would tick straight back out of', async () => {
      mockRecordObservation.mockResolvedValue({ point: {}, series: {}, shouldAdvance: false });

      const result = await caller.recordObservation({
        id: 'orchestration_workflow_1',
        key: 'followers',
        value: 400,
      });

      expect(mockScheduleOrchestrationWorkflowAdvance).not.toHaveBeenCalled();
      // `shouldAdvance` is coordination bookkeeping, not part of the response.
      expect(result.data).not.toHaveProperty('shouldAdvance');
    });
  });
});

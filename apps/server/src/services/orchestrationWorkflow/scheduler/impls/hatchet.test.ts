// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import { HatchetOrchestrationWorkflowScheduler } from './hatchet';

const mocks = vi.hoisted(() => ({ enqueueHatchetTask: vi.fn() }));

vi.mock('@/libs/hatchet', () => mocks);

describe('HatchetOrchestrationWorkflowScheduler', () => {
  const scheduler = new HatchetOrchestrationWorkflowScheduler();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules an owner-scoped orchestration workflow advance', async () => {
    mocks.enqueueHatchetTask.mockResolvedValue('hatchet-run:run-1');

    const id = await scheduler.scheduleAdvance({
      delay: 5,
      orchestrationWorkflowId: 'orchestration-workflow-1',
      trigger: 'create',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(id).toBe('hatchet-run:run-1');
    expect(mocks.enqueueHatchetTask).toHaveBeenCalledWith(
      HATCHET_TASK_NAMES.orchestrationWorkflowAdvance,
      {
        orchestrationWorkflowId: 'orchestration-workflow-1',
        trigger: 'create',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      { delayMs: 5000 },
    );
  });
});

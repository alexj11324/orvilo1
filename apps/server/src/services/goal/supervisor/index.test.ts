// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { GoalSupervisorService } from './index';
import { GoalSupervisorTools } from './tools';

describe('retired Goal supervisor', () => {
  it('rejects recovery and incident writes before a transaction or model access', async () => {
    const transaction = vi.fn();
    const db = { transaction } as never;
    const service = new GoalSupervisorService(db, 'owner');
    const graph = {} as never;
    for (const run of [
      () => service.stop(graph),
      () => service.reviewFailure(graph, 'node', {} as never),
      () => service.updateIncident('goal', 'incident', { status: 'recovered' }),
      () => service.recordDispatch(graph, 'task', 'operation'),
      () => service.recordProgress(graph, 'task'),
    ])
      await expect(run()).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    const tools = new GoalSupervisorTools({ serverDB: db, userId: 'owner' });
    await expect(
      tools.resolveInterruption({
        goalId: 'goal',
        incidentId: 'incident',
        action: 'retry',
        instruction: 'Retry',
        reason: 'Old callback',
      }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(transaction).not.toHaveBeenCalled();
  });
});

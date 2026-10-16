// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { TaskRecoveryCoordinator } from './taskRecoveryCoordinator';

describe('retired standalone Goal task recovery', () => {
  it('rejects before claiming or spawning another Task run', async () => {
    const access = vi.fn(() => {
      throw new Error('Unexpected database access');
    });
    const db = new Proxy({}, { get: access }) as never;
    await expect(
      new TaskRecoveryCoordinator(db, 'owner').recover({
        goal: { id: 'old-goal', config: {}, maxRounds: 10, maxTotalCost: null } as never,
        task: { id: 'old-task', totalTopics: 0 } as never,
      }),
    ).rejects.toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
    expect(access).not.toHaveBeenCalled();
  });
});

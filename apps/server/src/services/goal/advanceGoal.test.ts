import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ db: vi.fn(), trace: vi.fn() }));
vi.mock('@/database/server', () => ({ getServerDB: mocks.db }));
vi.mock('./traceStore', () => ({ createDefaultGoalTraceStore: mocks.trace }));
const { advanceGoal } = await import('./advanceGoal');

describe('persisted Goal advance callback', () => {
  it('acknowledges retirement without database or trace writes', async () => {
    expect(await advanceGoal({ goalId: 'old-goal', userId: 'owner' })).toMatchObject({
      ticks: 0,
      result: { outcome: 'no_progress' },
    });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.trace).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ advance: vi.fn(), create: vi.fn() }));
vi.mock('@/services/goal', () => ({ goalService: mocks }));
const { goalExecutor } = await import('./index');

describe('retired Goal executor', () => {
  it('rejects a persisted call without creating or advancing a Goal', async () => {
    const result = await goalExecutor.createGoal();
    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('NotSupported');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.advance).not.toHaveBeenCalled();
  });
});

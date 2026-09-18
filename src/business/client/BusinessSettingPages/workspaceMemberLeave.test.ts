import { afterEach, describe, expect, it, vi } from 'vitest';

import { runLeaveWorkspace } from './workspaceMemberLeave';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/libs/swr', () => ({ mutate: mocks.mutate }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('runLeaveWorkspace', () => {
  it('drops the cached workspace list before exiting to personal mode', async () => {
    const order: string[] = [];
    const leave = vi.fn(async () => {
      order.push('leave');
      return true;
    });
    mocks.mutate.mockImplementation(async () => order.push('mutate'));
    const switchToPersonal = vi.fn(async () => {
      order.push('switch');
    });

    const result = await runLeaveWorkspace({ leave, switchToPersonal });

    expect(result).toBe(true);
    // A stale `workspace.list` snapshot would keep the departed workspace
    // selectable, so the cache must be invalidated before the switch.
    expect(order).toEqual(['leave', 'mutate', 'switch']);
    expect(mocks.mutate).toHaveBeenCalledWith('teammates:workspaces');
  });

  it('does not touch the workspace list when the server rejects the leave', async () => {
    const leave = vi.fn(async () => false);
    const switchToPersonal = vi.fn();

    const result = await runLeaveWorkspace({ leave, switchToPersonal });

    expect(result).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(switchToPersonal).not.toHaveBeenCalled();
  });
});

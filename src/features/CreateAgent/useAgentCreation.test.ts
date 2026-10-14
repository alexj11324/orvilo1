import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAgentCreation } from './useAgentCreation';

const create = vi.hoisted(() => vi.fn());
vi.mock('@/services/agentOnboarding', () => ({ createOnboardingAgentOnce: create }));
describe('Agent creation draft recovery', () => {
  it('unlocks a refused draft and submits the corrected configuration on retry', async () => {
    create
      .mockReset()
      .mockImplementationOnce(async (checkpoint) => {
        checkpoint.attempted = true;
        throw new Error('The selected device is unavailable');
      })
      .mockResolvedValueOnce({ agentId: 'created-agent' });
    let name = 'Original';
    const { result } = renderHook(() =>
      useAgentCreation({
        createAgent: vi.fn(),
        ready: true,
        prepare: async () => ({ config: { title: name } }),
      }),
    );
    await act(async () => result.current.submit());
    expect(result.current.locked).toBe(false);
    expect((result.current.error as Error).message).toBe('The selected device is unavailable');
    name = 'Corrected';
    await act(async () => result.current.submit());
    expect(create.mock.calls[1][1].config.title).toBe('Corrected');
    expect(result.current.hasSavedAgent).toBe(true);
  });
  it('retries only completion when creation succeeded but the follow-up failed', async () => {
    create.mockReset().mockResolvedValue({ agentId: 'created-agent' });
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useAgentCreation({
        createAgent: vi.fn(),
        ready: true,
        prepare: async () => ({ config: { title: 'Agent' } }),
        onCreated: complete,
      }),
    );
    await act(async () => result.current.submit());
    expect(result.current.locked).toBe(true);
    await act(async () => result.current.submit());
    expect(create).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSavedEventTrigger } from './useSavedEventTrigger';

const boundary = vi.hoisted(() => ({
  stop: vi.fn(),
  mutate: vi.fn(),
  inventory: vi.fn(),
  discovery: vi.fn(),
}));
vi.mock('@/services/mcpEvents', () => ({ mcpEventsService: { stop: boundary.stop } }));
vi.mock('@/store/mcpEvents', () => ({
  useMcpEventsStore: (selector: any) =>
    selector({
      useFetchEventTriggers: () => ({
        data: { data: { triggers: [{ id: 'saved', bindingState: 'active' }] } },
        mutate: boundary.mutate,
      }),
      useFetchEventSources: boundary.inventory,
      useFetchEventDefinitions: boundary.discovery,
    }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  boundary.mutate.mockResolvedValue(undefined);
  boundary.stop.mockResolvedValue({ data: { stopped: true, cleanupPending: true } });
});

describe('persisted event trigger management', () => {
  it.each(['inventory', 'discovery'] as const)(
    'remains manageable when remote %s is unavailable',
    async (operation) => {
      boundary[operation].mockImplementation(() => {
        throw new Error('source disconnected');
      });
      const { result } = renderHook(() => useSavedEventTrigger('task'));
      expect(result.current.trigger?.id).toBe('saved');
      await act(async () => result.current.stop());
      expect(result.current.cleanupPending).toBe(true);
      expect(result.current.pending).toBe(false);
      expect(result.current.stopError).toBeUndefined();
      expect(boundary[operation]).not.toHaveBeenCalled();
      expect(boundary.mutate).toHaveBeenCalledOnce();
    },
  );
  it('settles pending state and exposes refresh failure after revocation', async () => {
    const error = new Error('database read unavailable');
    boundary.mutate.mockRejectedValue(error);
    const { result } = renderHook(() => useSavedEventTrigger('task'));
    await act(async () => result.current.stop());
    expect(result.current.pending).toBe(false);
    expect(result.current.stopError).toBe(error);
    expect(result.current.cleanupPending).toBe(true);
  });
});

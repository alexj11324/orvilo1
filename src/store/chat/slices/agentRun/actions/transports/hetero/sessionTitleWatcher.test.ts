import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_TITLE_LISTENER_TIMEOUT_MS, watchSessionTitle } from './sessionTitleWatcher';

const installIpc = () => {
  const listeners = new Map<string, (...args: any[]) => void>();
  (globalThis as any).window = {
    electron: {
      ipcRenderer: {
        on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
          listeners.set(channel, handler);
          return () => listeners.delete(channel);
        }),
      },
    },
  };
  return listeners;
};

describe('watchSessionTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
  });

  it('delivers titles for its own session, also after the run detached', () => {
    const listeners = installIpc();
    const onTitle = vi.fn();
    const watcher = watchSessionTitle('s1', onTitle);

    listeners.get('heteroAgentSessionTitle')?.(null, { sessionId: 's2', title: 'other' });
    watcher.detachAfterRun();
    listeners.get('heteroAgentSessionTitle')?.(null, { sessionId: 's1', title: 'late' });

    expect(onTitle).toHaveBeenCalledExactlyOnceWith('late');
  });

  it('removes the listeners on the end signal after the run detached', () => {
    const listeners = installIpc();
    const watcher = watchSessionTitle('s1', vi.fn());
    watcher.detachAfterRun();

    listeners.get('heteroAgentSessionTitleEnd')?.(null, { sessionId: 's1' });

    expect(listeners.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the listeners at the safety timeout when no end signal arrives', () => {
    const listeners = installIpc();
    const watcher = watchSessionTitle('s1', vi.fn());
    watcher.detachAfterRun();

    vi.advanceTimersByTime(SESSION_TITLE_LISTENER_TIMEOUT_MS - 1);
    expect(listeners.size).toBe(2);
    vi.advanceTimersByTime(1);

    expect(listeners.size).toBe(0);
  });

  it('keeps the safety timeout above the 5 s linger cap', () => {
    expect(SESSION_TITLE_LISTENER_TIMEOUT_MS).toBeGreaterThan(5000);
  });

  it('is inert without an electron bridge', () => {
    delete (globalThis as any).window;
    (globalThis as any).window = {};
    expect(() => watchSessionTitle('s1', vi.fn()).detachAfterRun()).not.toThrow();
  });
});

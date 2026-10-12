import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PresenceEntry } from '@/store/collaboration';
import { useUserStore } from '@/store/user';

import { type CollaborationContextValue } from './context';
import { useCursorPlacement } from './useCursorPlacement';

const RECT = { height: 100, left: 100, top: 200, width: 100 };

const entry = {
  actor: { color: '#f00', id: 'user-1', kind: 'human' as const, name: 'Ada' },
  connectionId: 'conn-1',
  receivedAt: 1_000,
  state: { cursor: { entityId: 't1', entityType: 'task', u: 0.5, v: 0.5 } },
} as unknown as PresenceEntry;

const makeCtx = (getRect: (id: string) => typeof RECT | null) => {
  const listeners = new Set<() => void>();
  let version = 0;
  const registry = {
    getRect: vi.fn(getRect),
    getVersion: () => version,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const ctx = {
    registry,
    room: { id: 'task-1', scope: 'task' as const },
    roomKey: 'task:task-1',
    send: null,
  } as unknown as CollaborationContextValue;
  return {
    ctx,
    bump: () => {
      version += 1;
      act(() => listeners.forEach((listener) => listener()));
    },
    registry,
  };
};

const mount = (ctx: CollaborationContextValue | null, node: HTMLDivElement) =>
  renderHook(({ context }) => useCursorPlacement(context, entry, { current: node }), {
    initialProps: { context: ctx },
  });

// Only browser preference/clock boundaries are controlled. The hook, its
// aggregate user store/selectors, and registry projection are real.
let systemReduced = false;
const mediaListeners = new Set<() => void>();
let previousSettings: ReturnType<typeof useUserStore.getState>['settings'];

const setSystemReducedMotion = (value: boolean) => {
  systemReduced = value;
  mediaListeners.forEach((listener) => listener());
};
const setAnimationMode = (animationMode: 'disabled' | 'agile' | undefined) => {
  useUserStore.setState((state) => ({
    settings: {
      ...state.settings,
      general: { ...state.settings.general, animationMode },
    },
  }));
};

beforeEach(() => {
  previousSettings = useUserStore.getState().settings;
  systemReduced = false;
  mediaListeners.clear();
  const query = {
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    get matches() {
      return systemReduced;
    },
    media: '(prefers-reduced-motion: reduce)',
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  } as unknown as MediaQueryList;
  // Installed before the first render; the native hook has no import-time
  // matchMedia capture or mocked responsive dependency.
  vi.spyOn(window, 'matchMedia').mockReturnValue(query);
  setAnimationMode(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useUserStore.setState({ settings: previousSettings });
  mediaListeners.clear();
});

const frameClock = () => {
  let now = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
  return {
    frames,
    frame: (time: number) => {
      now = time;
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(time)));
    },
  };
};

const at = (u: number, v: number): PresenceEntry => ({
  ...entry,
  state: { ...entry.state, cursor: { ...entry.state.cursor!, u, v } },
});

const mountMovingCursor = (node: HTMLDivElement) => {
  const { ctx } = makeCtx(() => RECT);
  const ref = { current: node };
  return renderHook(({ cursorEntry }) => useCursorPlacement(ctx, cursorEntry, ref), {
    initialProps: { cursorEntry: entry },
  });
};

describe('useCursorPlacement', () => {
  it('positions the mounted node before it becomes visible (N08)', async () => {
    const { ctx } = makeCtx(() => RECT);
    const node = document.createElement('div');

    const { result } = mount(ctx, node);

    // u=v=0.5 over rect(100,200,100,100) → translate(150px, 250px) written to
    // the node before `visible` flips — no flash at the overlay origin.
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(node.style.transform).toBe('translate(150px, 250px)');
    expect(result.current.collabId).not.toBeNull();
  });

  it('stays invisible while the anchor is missing, then appears positioned', async () => {
    let rect: typeof RECT | null = null;
    const { bump, ctx } = makeCtx(() => rect);
    const node = document.createElement('div');

    const { result } = mount(ctx, node);

    await waitFor(() => expect(result.current.visible).toBe(false));
    expect(node.style.transform).toBe('');

    rect = RECT;
    bump();

    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(node.style.transform).toBe('translate(150px, 250px)');
  });

  it('snaps back to the anchor position when the anchor re-mounts', async () => {
    let rect: typeof RECT | null = RECT;
    const { bump, ctx } = makeCtx(() => rect);
    const node = document.createElement('div');

    const { result } = mount(ctx, node);

    await waitFor(() => expect(node.style.transform).toBe('translate(150px, 250px)'));

    // Virtualized list unmounts the anchor — cursor hides again.
    rect = null;
    bump();
    await waitFor(() => expect(result.current.visible).toBe(false));

    // Re-mounted elsewhere — the cursor re-projects instead of easing from
    // its stale last position.
    rect = { height: 100, left: 400, top: 40, width: 100 };
    bump();
    await waitFor(() => expect(node.style.transform).toBe('translate(450px, 90px)'));
    expect(result.current.visible).toBe(true);
  });

  it.each([
    ['agile', false, true],
    ['disabled', false, false],
    ['agile', true, false],
    ['disabled', true, false],
  ] as const)(
    'honors animationMode=%s and system reduced=%s on a changed projection',
    (mode, reduced, animated) => {
      setAnimationMode(mode);
      setSystemReducedMotion(reduced);
      const clock = frameClock();
      const node = document.createElement('div');
      const { rerender } = mountMovingCursor(node);

      rerender({ cursorEntry: at(0.900125, 0.40075) });
      if (animated) {
        expect(node.style.transform).toBe('translate(150px, 250px)');
        clock.frame(100);
      }
      expect(node.style.transform).toBe('translate(190.0125px, 240.075px)');
      expect(clock.frames.size).toBe(0);
    },
  );

  it('stops a running interpolation when the user disables animation, including the queued-frame race', () => {
    const clock = frameClock();
    const node = document.createElement('div');
    const { rerender } = mountMovingCursor(node);
    const target = 'translate(190.0125px, 240.075px)';
    rerender({ cursorEntry: at(0.900125, 0.40075) });
    clock.frame(30);
    expect(node.style.transform).not.toBe(target);

    // Run the already-queued frame before React flushes the store rerender.
    act(() => {
      setAnimationMode('disabled');
      clock.frame(40);
    });
    expect(node.style.transform).toBe(target);
    expect(clock.frames.size).toBe(0);
    clock.frame(80);
    expect(node.style.transform).toBe(target);

    act(() => setAnimationMode('agile'));
    expect(clock.frames.size).toBe(0);
    rerender({ cursorEntry: at(0.12345, 0.98765) });
    expect(clock.frames.size).toBe(1);
    clock.frame(180);
    expect(node.style.transform).toBe('translate(112.345px, 298.765px)');
  });

  it('stops on a live OS change without new presence data and resumes only for a later target', () => {
    const clock = frameClock();
    const node = document.createElement('div');
    const { rerender } = mountMovingCursor(node);
    const target = 'translate(190.0125px, 240.075px)';
    rerender({ cursorEntry: at(0.900125, 0.40075) });
    clock.frame(30);
    expect(node.style.transform).not.toBe(target);

    act(() => {
      setSystemReducedMotion(true);
      clock.frame(40);
    });
    expect(node.style.transform).toBe(target);
    expect(clock.frames.size).toBe(0);
    act(() => setSystemReducedMotion(false));
    expect(clock.frames.size).toBe(0);
    rerender({ cursorEntry: at(0.12345, 0.98765) });
    expect(clock.frames.size).toBe(1);
    clock.frame(140);
    expect(node.style.transform).toBe('translate(112.345px, 298.765px)');
  });

  it('cancels its pending frame and media subscription on unmount without writing the detached cursor', () => {
    const clock = frameClock();
    const node = document.createElement('div');
    const { rerender, unmount } = mountMovingCursor(node);
    rerender({ cursorEntry: at(0.900125, 0.40075) });
    clock.frame(30);
    const beforeUnmount = node.style.transform;
    expect(clock.frames.size).toBe(1);
    unmount();

    expect(clock.frames.size).toBe(0);
    expect(mediaListeners.size).toBe(0);
    setSystemReducedMotion(true);
    clock.frame(90);
    expect(node.style.transform).toBe(beforeUnmount);
  });
});

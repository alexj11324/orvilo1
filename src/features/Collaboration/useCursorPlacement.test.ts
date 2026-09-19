import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PresenceEntry } from '@/store/collaboration';

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
});

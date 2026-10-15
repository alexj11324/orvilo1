import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from '@/store/user';

import TaskDock from './index';
import {
  groupDockTasks,
  hasCancellableTask,
  resolveDockOverview,
  shouldAutoDismiss,
} from './presentation';
import type { DockTask, DockTaskStatus } from './type';

const task = (status: DockTaskStatus, extra: Partial<DockTask> = {}): DockTask => ({
  groupLabel: 'Uploads',
  id: `${status}-${Math.random()}`,
  status,
  title: 'index.html',
  ...extra,
});

describe('resolveDockOverview', () => {
  it('stays running while any task is pending or running', () => {
    const overview = resolveDockOverview([task('success'), task('error'), task('pending')]);

    expect(overview.status).toBe('running');
    expect(overview.activeCount).toBe(1);
  });

  it('averages progress across active tasks only', () => {
    const overview = resolveDockOverview([
      task('running', { progress: 20 }),
      task('running', { progress: 80 }),
      task('success', { progress: 100 }),
    ]);

    expect(overview.progress).toBe(50);
  });

  it('treats a running task without progress as zero', () => {
    expect(resolveDockOverview([task('running')]).progress).toBe(0);
  });

  it('reports error over success once nothing is active', () => {
    expect(resolveDockOverview([task('success'), task('error')]).status).toBe('error');
  });

  it('settles at 100 with no active task', () => {
    const overview = resolveDockOverview([task('success')]);

    expect(overview).toEqual({ activeCount: 0, progress: 100, status: 'success' });
  });

  it('falls back to cancelled when nothing succeeded or failed', () => {
    expect(resolveDockOverview([task('cancelled')]).status).toBe('cancelled');
  });
});

describe('hasCancellableTask', () => {
  it('only counts active tasks that expose a cancel', () => {
    expect(hasCancellableTask([task('running')])).toBe(false);
    expect(hasCancellableTask([task('success', { cancel: vi.fn() })])).toBe(false);
    expect(hasCancellableTask([task('running', { cancel: vi.fn() })])).toBe(true);
  });
});

describe('groupDockTasks', () => {
  it('keeps both group order and task order', () => {
    const groups = groupDockTasks([
      task('running', { groupLabel: 'Publishing', title: 'index.html' }),
      task('running', { groupLabel: 'Uploads', title: 'hero.png' }),
      task('pending', { groupLabel: 'Publishing', title: 'about.html' }),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Publishing', 'Uploads']);
    expect(groups[0].tasks.map((t) => t.title)).toEqual(['index.html', 'about.html']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupDockTasks([])).toEqual([]);
  });
});

describe('shouldAutoDismiss', () => {
  it('clears a success with nothing to hand back', () => {
    expect(shouldAutoDismiss(task('success'))).toBe(true);
  });

  it('keeps a success that left a result', () => {
    expect(shouldAutoDismiss(task('success', { result: { label: 'orvilo.link/x' } }))).toBe(false);
  });

  it('never clears a failure or an active task', () => {
    expect(shouldAutoDismiss(task('error'))).toBe(false);
    expect(shouldAutoDismiss(task('running'))).toBe(false);
  });
});

const liveMedia = vi.hoisted(() => {
  const handlers = new Set<(event: MediaQueryListEvent) => void>();
  const state = { reduced: false };
  const originalMatchMedia = window.matchMedia;
  const media = {
    get matches() {
      return state.reduced;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: (handler: (event: MediaQueryListEvent) => void) => handlers.add(handler),
    removeListener: (handler: (event: MediaQueryListEvent) => void) => handlers.delete(handler),
    addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      handlers.add(handler),
    removeEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
      handlers.delete(handler),
    dispatchEvent: () => true,
  };
  // matchmediaquery captures this OS function at public-module import time.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      query === media.media || !originalMatchMedia ? media : originalMatchMedia.call(window, query),
    writable: true,
  });
  return { handlers, media, state };
});

vi.unmock('@/components/ui/button');
vi.unmock('@/components/ActionIcon');
vi.unmock('@base-ui/react/button');
vi.unmock('motion/react');
vi.unmock('motion/react-m');
vi.unmock('react-responsive');
// Only the task-producing service boundary is seeded. Actual TaskDock, Item,
// ActionIcon/Button/Tooltip, presence and both real motion hooks are retained.
vi.mock('./useDockTasks', () => ({
  useDockTasks: () => [
    { groupLabel: 'Uploads', id: 'live-one', status: 'running', title: 'live-task-one' },
    { groupLabel: 'Uploads', id: 'live-two', status: 'running', title: 'live-task-two' },
  ],
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TaskDock live motion exit', () => {
  it.each(['system', 'user'] as const)(
    'settles an existing exit when the %s motion setting changes live',
    async (gate) => {
      liveMedia.state.reduced = false;
      const settings = useUserStore.getState().settings;
      useUserStore.setState({
        settings: { ...settings, general: { ...settings.general, animationMode: 'elegant' } },
      });
      render(createElement(LazyMotion, { features: domAnimation }, createElement(TaskDock)));
      expect(screen.getByText('live-task-one')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'taskDock.collapse' }));
      // The ordinary 200ms exit is present before the live disable event.
      expect(screen.getByText('live-task-one')).toBeInTheDocument();
      await act(async () => {
        if (gate === 'system') {
          liveMedia.state.reduced = true;
          for (const handler of liveMedia.handlers) {
            handler({ matches: true, media: liveMedia.media.media } as MediaQueryListEvent);
          }
        } else {
          const current = useUserStore.getState().settings;
          useUserStore.setState({
            settings: { ...current, general: { ...current.general, animationMode: 'disabled' } },
          });
        }
      });
      expect(screen.queryByText('live-task-one')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'taskDock.expand' })).toBeInTheDocument();
      await act(async () => {
        liveMedia.state.reduced = false;
        for (const handler of liveMedia.handlers) {
          handler({ matches: false, media: liveMedia.media.media } as MediaQueryListEvent);
        }
        const current = useUserStore.getState().settings;
        useUserStore.setState({
          settings: { ...current, general: { ...current.general, animationMode: 'elegant' } },
        });
      });
      fireEvent.click(screen.getByRole('button', { name: 'taskDock.expand' }));
      expect(screen.getByText('live-task-one')).toBeInTheDocument();
    },
  );
});

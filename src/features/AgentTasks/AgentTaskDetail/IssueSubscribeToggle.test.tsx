/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import IssueSubscribeToggle from './IssueSubscribeToggle';
import { TaskDetailScope } from './TaskDetailScope';

const mocks = vi.hoisted(() => ({
  refreshTaskDetail: vi.fn(),
  state: {
    activeTaskId: 'T-1',
    taskDetailMap: {} as Record<string, Record<string, unknown>>,
  },
  subscribe: vi.fn(),
  toastError: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/store/task', () => {
  const state = () => ({
    ...mocks.state,
    internal_refreshTaskDetail: mocks.refreshTaskDetail,
  });
  const useTaskStore = (selector: (value: unknown) => unknown) => selector(state());
  useTaskStore.getState = state;
  return { useTaskStore };
});

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { fullName: 'Viewer' } }),
}));

vi.mock('@/hooks/useUserAvatar', () => ({ useUserAvatar: () => 'viewer.png' }));

vi.mock('@/services/workAttention', () => ({
  workAttentionService: { subscribe: mocks.subscribe, unsubscribe: mocks.unsubscribe },
}));

vi.mock('@/components/toast', () => ({ toast: { error: mocks.toastError } }));

const setDetail = (detail: Record<string, unknown>) => {
  mocks.state.taskDetailMap = {
    'T-1': { id: 'task-uuid-1', identifier: 'T-1', ...detail },
  };
};

const renderToggle = () =>
  render(
    <TaskDetailScope taskId="T-1">
      <IssueSubscribeToggle />
    </TaskDetailScope>,
  );

describe('IssueSubscribeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockResolvedValue(undefined);
    mocks.unsubscribe.mockResolvedValue(undefined);
    mocks.refreshTaskDetail.mockResolvedValue(undefined);
    setDetail({ isSubscribed: false });
  });
  afterEach(cleanup);

  it('presents the control as a quiet text link whose label is visible', () => {
    renderToggle();

    const subscribe = screen.getByRole('button', { name: 'myWork.subscribe' });
    expect(subscribe.textContent).toContain('myWork.subscribe');
    expect(subscribe.getAttribute('aria-pressed')).toBe('false');
    // No avatar claim while unsubscribed — Linear shows a face only once the
    // viewer actually follows.
    expect(document.querySelector('.orvilo-avatar')).toBeNull();
  });

  it('labels the control Unsubscribe and shows the viewer avatar while subscribed', () => {
    setDetail({ isSubscribed: true });
    renderToggle();

    const unsubscribe = screen.getByRole('button', { name: 'myWork.unsubscribe' });
    expect(unsubscribe.getAttribute('aria-pressed')).toBe('true');
    expect(unsubscribe.getAttribute('data-subscribed')).toBe('true');
    expect(document.querySelector('.orvilo-avatar')).not.toBeNull();
  });

  it('subscribes the issue by its database id and refreshes the detail', async () => {
    renderToggle();

    fireEvent.click(screen.getByRole('button', { name: 'myWork.subscribe' }));

    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith('task-uuid-1'));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.refreshTaskDetail).toHaveBeenCalledWith('T-1'));
  });

  it('unsubscribes while subscribed and reports a failed write instead of claiming it', async () => {
    setDetail({ isSubscribed: true });
    mocks.unsubscribe.mockRejectedValueOnce(new Error('offline'));
    renderToggle();

    fireEvent.click(screen.getByRole('button', { name: 'myWork.unsubscribe' }));

    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledWith('task-uuid-1'));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('myWork.unsubscribeFailed'));
  });

  it('stays on the mounted scope: a peek pane subscribes its own issue', async () => {
    setDetail({ isSubscribed: false });
    mocks.state.taskDetailMap['T-2'] = { id: 'task-uuid-2', identifier: 'T-2' };
    render(
      <TaskDetailScope taskId="T-2">
        <IssueSubscribeToggle />
      </TaskDetailScope>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'myWork.subscribe' }));

    await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith('task-uuid-2'));
    expect(mocks.refreshTaskDetail).toHaveBeenCalledWith('T-2');
  });
});

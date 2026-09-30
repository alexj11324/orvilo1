/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskScheduleDialogContent } from './TaskScheduleDialog';

const mocks = vi.hoisted(() => ({
  getReminder: vi.fn(),
  refreshTaskList: vi.fn(),
  setReminder: vi.fn(),
  toastError: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('@/services/task', () => ({
  taskService: {
    getReminder: mocks.getReminder,
    setReminder: mocks.setReminder,
  },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ refreshTaskList: mocks.refreshTaskList, updateTask: mocks.updateTask }),
}));

vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { error: mocks.toastError },
}));

vi.mock('@/components/ui/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const loaded = () => waitFor(() => expect(mocks.getReminder).toHaveBeenCalled());

describe('TaskScheduleDialogContent error feedback', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('toasts when the reminder load fails and still unlocks the preset rows', async () => {
    mocks.getReminder.mockRejectedValue(new Error('offline'));

    render(<TaskScheduleDialogContent identifier="T-1" initialDueDate={null} />);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.loadFailed'),
    );
    // reminderLoaded still resolves — the rows must not stay disabled forever.
    await waitFor(() => expect(screen.getByRole('button', { name: 'hour' })).not.toBeDisabled());
  });

  it('toasts on a failed due-date save and keeps the dialog interactive for retry', async () => {
    mocks.getReminder.mockResolvedValue({ data: { remindAt: null } });
    mocks.updateTask.mockRejectedValue(new Error('conflict'));

    render(<TaskScheduleDialogContent identifier="T-1" initialDueDate={null} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: /Today/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.saveFailed'),
    );
    // busy is released so a second click retries instead of dead-ending.
    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { dueDate: expect.any(String) });
    await waitFor(() => expect(screen.getByRole('button', { name: /Today/ })).not.toBeDisabled());
  });

  it('toasts on a failed reminder save and keeps the preset enabled for retry', async () => {
    mocks.getReminder.mockResolvedValue({ data: { remindAt: null } });
    mocks.setReminder.mockRejectedValue(new Error('offline'));

    render(<TaskScheduleDialogContent identifier="T-1" initialDueDate={null} />);
    await loaded();

    const preset = screen.getByRole('button', { name: 'hour' });
    await waitFor(() => expect(preset).not.toBeDisabled());
    fireEvent.click(preset);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('taskList.schedule.saveFailed'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'hour' })).not.toBeDisabled());
  });
});

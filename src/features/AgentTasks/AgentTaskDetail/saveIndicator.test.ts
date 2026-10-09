/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '@/store/task';

import IssueSaveStatus from './IssueSaveStatus';
import { initialSaveIndicator, reduceSaveIndicator, SAVED_VISIBLE_MS } from './saveIndicator';
import { runTrackedDescriptionSave } from './taskSaveRetry';
import { taskTitleSaveQueue } from './taskTitleSaveQueue';

describe('reduceSaveIndicator', () => {
  it('goes saving -> saved -> idle once the display window expires', () => {
    let state = reduceSaveIndicator('idle', { status: 'saving', type: 'status' });
    expect(state).toBe('saving');
    state = reduceSaveIndicator(state, { status: 'saved', type: 'status' });
    expect(state).toBe('saved');
    state = reduceSaveIndicator(state, { type: 'expire' });
    expect(state).toBe('idle');
    expect(SAVED_VISIBLE_MS).toBe(2000);
  });

  it('keeps failed through an expire tick', () => {
    expect(reduceSaveIndicator('failed', { type: 'expire' })).toBe('failed');
  });

  it('leaves saving alone when a stale expire arrives', () => {
    expect(reduceSaveIndicator('saving', { type: 'expire' })).toBe('saving');
  });

  it('returns to saving on a new edit after a failure, then saved', () => {
    let state = reduceSaveIndicator('idle', { status: 'failed', type: 'status' });
    state = reduceSaveIndicator(state, { status: 'saving', type: 'status' });
    expect(state).toBe('saving');
    expect(reduceSaveIndicator(state, { status: 'saved', type: 'status' })).toBe('saved');
  });

  it('does not replay a stale saved on mount but keeps saving / failed', () => {
    expect(initialSaveIndicator('saved')).toBe('idle');
    expect(initialSaveIndicator('failed')).toBe('failed');
    expect(initialSaveIndicator('saving')).toBe('saving');
    expect(initialSaveIndicator('idle')).toBe('idle');
  });
});

vi.mock('@/store/task', async () => {
  const { create } = await import('zustand');
  return { useTaskStore: create(() => ({ taskSaveStatusMap: {}, updateTask: vi.fn() })) };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('IssueSaveStatus lifecycle', () => {
  beforeEach(() => {
    useTaskStore.setState({ taskSaveStatusMap: {} });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not replay an old saved status on mount or reopen', () => {
    useTaskStore.setState({ taskSaveStatusMap: { 'saved-issue': 'saved' } });
    const first = render(createElement(IssueSaveStatus, { taskId: 'saved-issue' }));
    expect(screen.queryByText('autoSave.saved')).not.toBeInTheDocument();
    first.unmount();
    render(createElement(IssueSaveStatus, { taskId: 'saved-issue' }));
    expect(screen.queryByText('autoSave.saved')).not.toBeInTheDocument();
  });

  it('shows a new save after mounting, while keeping an old failure visible', () => {
    useTaskStore.setState({ taskSaveStatusMap: { 'new-save': 'failed' } });
    render(createElement(IssueSaveStatus, { taskId: 'new-save' }));
    expect(screen.getByText('autoSave.failed')).toBeInTheDocument();
    act(() => useTaskStore.setState({ taskSaveStatusMap: { 'new-save': 'saving' } }));
    expect(screen.getByText('autoSave.savingShort')).toBeInTheDocument();
    act(() => useTaskStore.setState({ taskSaveStatusMap: { 'new-save': 'saved' } }));
    expect(screen.getByText('autoSave.saved')).toBeInTheDocument();
  });

  it('does not offer an inert retry for a property-only failure', () => {
    useTaskStore.setState({ taskSaveStatusMap: { 'property-issue': 'failed' } });
    render(createElement(IssueSaveStatus, { taskId: 'property-issue' }));
    expect(screen.getByText('autoSave.failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'autoSave.retry' })).not.toBeInTheDocument();
  });

  it('updates retry availability when a title draft is queued and then saved', async () => {
    let complete!: () => void;
    const updateTask = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    useTaskStore.setState({ taskSaveStatusMap: { 'title-issue': 'failed' }, updateTask });
    render(createElement(IssueSaveStatus, { taskId: 'title-issue' }));
    expect(screen.queryByRole('button', { name: 'autoSave.retry' })).not.toBeInTheDocument();
    act(() => taskTitleSaveQueue.schedule('title-issue', 'Kept draft', updateTask));
    fireEvent.click(screen.getByRole('button', { name: 'autoSave.retry' }));
    expect(updateTask).toHaveBeenCalledWith('title-issue', { name: 'Kept draft' });
    expect(screen.queryByRole('button', { name: 'autoSave.retry' })).not.toBeInTheDocument();
    await act(async () => complete());
    expect(screen.queryByRole('button', { name: 'autoSave.retry' })).not.toBeInTheDocument();
  });

  it('offers the actual description retry when it is armed after the failure renders', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    useTaskStore.setState({ taskSaveStatusMap: { 'description-issue': 'failed' } });
    render(createElement(IssueSaveStatus, { taskId: 'description-issue' }));
    await act(async () => runTrackedDescriptionSave('description-issue', send));
    fireEvent.click(screen.getByRole('button', { name: 'autoSave.retry' }));
    expect(send).toHaveBeenLastCalledWith(true);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'autoSave.retry' })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

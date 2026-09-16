/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDetailData } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskPrerequisites from './TaskPrerequisites';

const mocks = vi.hoisted(() => ({
  addDependency: vi.fn(),
  allowed: true,
  navigate: vi.fn(),
  removeDependency: vi.fn(),
  state: {} as TaskStore,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: mocks.allowed, reason: mocks.allowed ? undefined : 'Read only' }),
}));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: TaskStore) => unknown) => selector(mocks.state),
}));

const setTask = (dependencies: TaskDetailData['dependencies'] = [], id = 'T-4') => {
  mocks.state = {
    activeTaskId: id,
    addDependency: mocks.addDependency,
    removeDependency: mocks.removeDependency,
    taskDetailMap: { [id]: { dependencies, identifier: id, status: 'backlog' } },
  } as unknown as TaskStore;
};
const key = (suffix: string) => `taskDetail.prerequisites.${suffix}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.addDependency.mockResolvedValue(undefined);
  mocks.removeDependency.mockResolvedValue(undefined);
  setTask();
});
afterEach(cleanup);

describe('TaskPrerequisites', () => {
  it('submits a trimmed prerequisite identifier and resets the editor', async () => {
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('empty'));
    const input = screen.getByRole('textbox', { name: key('input') });
    fireEvent.change(input, { target: { value: '  T-1  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-1', 'blocks'));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('shows blocking state until both prerequisites complete, ignoring relates edges', () => {
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-3', status: 'failed', type: 'relates' },
    ]);
    const view = render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    expect(screen.queryByText('T-3')).toBeNull();
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'completed', type: 'blocks' },
    ]);
    view.rerender(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('ready'));
  });

  it('keeps unavailable prerequisites blocking but removable by their raw id', async () => {
    setTask([{ dependsOn: 'task_hidden', id: 'task_hidden', status: null, type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    expect(screen.getByText(key('unavailable')).closest('button')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: key('remove') }));
    await waitFor(() => expect(mocks.removeDependency).toHaveBeenCalledWith('T-4', 'task_hidden'));
  });

  it('renders localized mutation errors without dropping the input', async () => {
    mocks.addDependency.mockRejectedValue(new Error('This dependency would create a cycle.'));
    render(<TaskPrerequisites />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'T-1' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(key('cycle')));
    expect((input as HTMLInputElement).value).toBe('T-1');
  });

  it('does not offer mutations to read-only users', () => {
    mocks.allowed = false;
    setTask([{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: key('remove') })).toBeNull();
    expect(screen.getByText('Read only')).toBeTruthy();
  });

  it('resets local state when moving to another issue', () => {
    const view = render(<TaskPrerequisites />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'T-1' } });
    setTask([], 'T-5');
    view.rerender(<TaskPrerequisites />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });
});

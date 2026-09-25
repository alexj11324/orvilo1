/** @vitest-environment happy-dom */
import type { TaskDetailData } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskPrerequisites from './TaskPrerequisites';

const mocks = vi.hoisted(() => ({
  addBlocking: vi.fn(),
  addDependency: vi.fn(),
  allowed: true,
  navigate: vi.fn(),
  removeBlocking: vi.fn(),
  removeDependency: vi.fn(),
  state: {} as TaskStore,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.title ? `${key}:${values.title}` : key,
  }),
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    allowed: mocks.allowed,
    reason: mocks.allowed ? undefined : 'Read only',
  }),
}));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: TaskStore) => unknown) => selector(mocks.state),
}));

const setTask = (
  dependencies: TaskDetailData['dependencies'] = [],
  dependents: TaskDetailData['dependents'] = [],
  id = 'T-4',
) => {
  mocks.state = {
    activeTaskId: id,
    addBlocking: mocks.addBlocking,
    addDependency: mocks.addDependency,
    removeBlocking: mocks.removeBlocking,
    removeDependency: mocks.removeDependency,
    taskDetailMap: { [id]: { dependencies, dependents, identifier: id, status: 'backlog' } },
  } as unknown as TaskStore;
};
const key = (suffix: string) => `taskDetail.prerequisites.${suffix}`;
const addFor = (sectionTitle: string) => `taskDetail.relations.addTo:${sectionTitle}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.addBlocking.mockResolvedValue(undefined);
  mocks.addDependency.mockResolvedValue(undefined);
  mocks.removeBlocking.mockResolvedValue(undefined);
  mocks.removeDependency.mockResolvedValue(undefined);
  setTask();
});
afterEach(cleanup);

describe('TaskPrerequisites', () => {
  it('submits a trimmed prerequisite identifier and closes the editor', async () => {
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('empty'));
    fireEvent.click(screen.getByRole('button', { name: addFor('taskDetail.blockedBy.title') }));
    const input = screen.getByRole('textbox', { name: key('input') });
    fireEvent.change(input, { target: { value: '  T-1  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-1', 'blocks'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('shows blocking state until both prerequisites complete; relates rows render but do not block', () => {
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-3', status: 'failed', type: 'relates' },
    ]);
    const view = render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    // The Related rail lists every edge — a relates row is a link, not a
    // blocker, so it renders but never counts toward the blocked hint.
    expect(screen.getByText('T-3')).toBeTruthy();
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-3', status: 'failed', type: 'relates' },
    ]);
    view.rerender(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('ready'));
    expect(screen.getByText('T-3')).toBeTruthy();
  });

  it('removes a prerequisite by its identifier, not its raw id', async () => {
    // resolve() treats non-task_ strings as identifiers, so the row must send
    // the identifier: raw ids follow other conventions (e.g. seeded taskpvNN).
    setTask([{ dependsOn: 'T-5', id: 'taskpv05', status: null, type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    // The row composes `identifier · unavailable` — match the composed text,
    // then walk up to the (disabled) navigation button.
    const unavailableText = screen.getByText(new RegExp(key('unavailable')));
    expect(unavailableText.closest('button')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: key('remove') }));
    await waitFor(() => expect(mocks.removeDependency).toHaveBeenCalledWith('T-4', 'T-5'));
  });

  it('adds a Blocking relation by inverting the edge onto the other task', async () => {
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: addFor('taskDetail.blocking.title') }));
    const input = screen.getByRole('textbox', { name: key('input') });
    fireEvent.change(input, { target: { value: 'T-2' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mocks.addBlocking).toHaveBeenCalledWith('T-4', 'T-2'));
  });

  it('removes a Blocking row through the dependent side of the edge', async () => {
    setTask([], [{ dependsBy: 'T-2', id: 'task_2', status: 'backlog', type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.getByText('T-2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: key('remove') }));
    await waitFor(() => expect(mocks.removeBlocking).toHaveBeenCalledWith('T-4', 'T-2'));
  });

  it('adds a Related relation with the relates type', async () => {
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: addFor('taskDetail.related') }));
    const input = screen.getByRole('textbox', { name: key('input') });
    fireEvent.change(input, { target: { value: 'T-3' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-3', 'relates'));
  });

  it('renders localized mutation errors without dropping the input', async () => {
    mocks.addDependency.mockRejectedValue(new Error('This dependency would create a cycle.'));
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: addFor('taskDetail.blockedBy.title') }));
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
    expect(screen.queryByRole('button', { name: /taskDetail\.relations\.addTo/ })).toBeNull();
    expect(screen.getByText('Read only')).toBeTruthy();
  });

  it('resets local state when moving to another issue', () => {
    const view = render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: addFor('taskDetail.blockedBy.title') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'T-1' } });
    setTask([], [], 'T-5');
    view.rerender(<TaskPrerequisites />);
    // The editor remounts under the new task id — the add form is closed again.
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

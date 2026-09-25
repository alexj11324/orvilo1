/** @vitest-environment happy-dom */
import type { TaskDetailData } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskPrerequisites from './TaskPrerequisites';

const mocks = vi.hoisted(() => ({
  addDependency: vi.fn(),
  allowed: true,
  navigate: vi.fn(),
  removeDependency: vi.fn(),
  removeIssueRelation: vi.fn(),
  state: {} as TaskStore,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { identifier?: string; position?: number }) =>
      [key, options?.identifier, options?.position]
        .filter((value) => value !== undefined)
        .join(':'),
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

const setTask = (dependencies: TaskDetailData['dependencies'] = [], id = 'T-4') => {
  mocks.state = {
    activeTaskId: id,
    addDependency: mocks.addDependency,
    removeDependency: mocks.removeDependency,
    removeIssueRelation: mocks.removeIssueRelation,
    taskDetailMap: { [id]: { dependencies, identifier: id, status: 'backlog' } },
  } as unknown as TaskStore;
};
const key = (suffix: string) => `taskDetail.prerequisites.${suffix}`;
const removeLabel = (suffix: 'removeBlocker' | 'removeRelated', identifier: string) =>
  `${key(suffix)}:${identifier}`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.addDependency.mockResolvedValue(undefined);
  mocks.removeDependency.mockResolvedValue(undefined);
  mocks.removeIssueRelation.mockResolvedValue(undefined);
  setTask();
});
afterEach(cleanup);

describe('TaskPrerequisites', () => {
  it('submits a trimmed related issue identifier without creating a blocker', async () => {
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('empty'));
    const input = screen.getByRole('textbox', { name: key('input') });
    fireEvent.change(input, { target: { value: '  T-1  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-1', 'relates'));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
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
    expect(screen.getAllByText(key('blockedBy'))).toHaveLength(2);
    expect(screen.getByText(key('related'))).toBeTruthy();
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-3', status: 'failed', type: 'relates' },
    ]);
    view.rerender(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('ready'));
    expect(screen.getByText('T-3')).toBeTruthy();
  });

  it('uses the board workflow glyph for a linked issue with a provider state', () => {
    setTask([
      {
        dependsOn: 'T-1',
        status: 'completed',
        type: 'relates',
        workflowCategory: 'in_progress',
        workflowStateId: 'linear-state-progress',
      },
    ]);
    render(<TaskPrerequisites />);

    const linkedIssue = screen.getByText('T-1').closest('button');
    expect(linkedIssue?.querySelector('svg')).toHaveAttribute('data-workflow-icon', 'in_progress');
  });

  it('keeps unavailable prerequisites blocking but removable by their raw id', async () => {
    setTask([{ dependsOn: 'task_hidden', id: 'task_hidden', status: null, type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    // The row composes `identifier · unavailable` — match the composed text,
    // then walk up to the (disabled) navigation button.
    const unavailableText = screen.getByText(new RegExp(key('unavailable')));
    expect(unavailableText.closest('button')?.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: removeLabel('removeBlocker', 'task_hidden'),
      }),
    );
    await waitFor(() =>
      expect(mocks.removeDependency).toHaveBeenCalledWith('T-4', 'task_hidden', 'blocks'),
    );
  });

  it('removes a regular relation without requesting deletion of a blocker', async () => {
    setTask([{ dependsOn: 'T-2', id: 'task_related', status: 'backlog', type: 'relates' }]);
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: removeLabel('removeRelated', 'T-2') }));
    await waitFor(() =>
      expect(mocks.removeDependency).toHaveBeenCalledWith('T-4', 'task_related', 'relates'),
    );
  });

  it('names blocking and ordinary removal separately for the same issue', () => {
    setTask([
      { dependsOn: 'T-1', relationId: 'edge-block', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-1', relationId: 'edge-related', status: 'backlog', type: 'relates' },
    ]);
    render(<TaskPrerequisites />);
    expect(screen.getByRole('button', { name: removeLabel('removeBlocker', 'T-1') })).toBeTruthy();
    expect(screen.getByRole('button', { name: removeLabel('removeRelated', 'T-1') })).toBeTruthy();
  });

  it('unlinks an unreadable related issue using only the opaque relation id', async () => {
    const relationId = '5e3d328d-6c4a-46af-88b7-a492268839e1';
    setTask([
      { dependsOn: 'Unavailable related issue', relationId, status: null, type: 'relates' },
    ]);
    render(<TaskPrerequisites />);
    fireEvent.click(
      screen.getByRole('button', {
        name: removeLabel('removeRelated', 'Unavailable related issue'),
      }),
    );
    await waitFor(() => expect(mocks.removeIssueRelation).toHaveBeenCalledWith('T-4', relationId));
    expect(mocks.removeDependency).not.toHaveBeenCalled();
  });

  it('gives duplicate unavailable related removals distinct accessible names', () => {
    setTask([
      {
        dependsOn: 'Unavailable related issue',
        relationId: 'edge-hidden-1',
        status: null,
        type: 'relates',
      },
      {
        dependsOn: 'Unavailable related issue',
        relationId: 'edge-hidden-2',
        status: null,
        type: 'relates',
      },
    ]);
    render(<TaskPrerequisites />);

    const buttons = screen.getAllByRole('button', { name: new RegExp(key('removeRelated')) });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      `${key('removeRelated')}:${key('relationPosition')}:Unavailable related issue:1`,
      `${key('removeRelated')}:${key('relationPosition')}:Unavailable related issue:2`,
    ]);
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

  it('explains an existing blocking relation without clearing the proposed link', async () => {
    mocks.addDependency.mockRejectedValue(
      new Error('A blocking relationship already exists for this issue pair.'),
    );
    render(<TaskPrerequisites />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'T-1' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(key('relationConflict')),
    );
    expect((input as HTMLInputElement).value).toBe('T-1');
  });

  it('does not offer mutations to read-only users', () => {
    mocks.allowed = false;
    setTask([{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }]);
    render(<TaskPrerequisites />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: removeLabel('removeBlocker', 'T-1') })).toBeNull();
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

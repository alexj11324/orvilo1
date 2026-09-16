import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TaskPrerequisites from './TaskPrerequisites';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  allowed: true,
  navigate: vi.fn(),
  remove: vi.fn(),
  removeById: vi.fn(),
  retry: vi.fn(),
  detail: {} as Record<string, unknown>,
  queryResult: {} as Record<string, unknown>,
}));
vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({
    icon: _icon,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown; size?: string }) => (
    <button {...props} />
  ),
  Text: ({ children, role }: { children?: ReactNode; role?: string }) => (
    <span role={role}>{children}</span>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { task?: string }) =>
      options?.task ? `${key} ${options.task}` : key,
  }),
}));
vi.mock('ahooks', () => ({ useDebounce: (value: string) => value }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: mocks.allowed }) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/libs/swr', () => ({ useClientDataSWR: () => mocks.queryResult }));
vi.mock('@/services/task', () => ({ taskService: { searchDependencyCandidates: vi.fn() } }));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: unknown) => unknown) =>
    selector({
      activeTaskId: 'T-4',
      taskDetailMap: { 'T-4': mocks.detail },
      addDependency: mocks.add,
      removeDependency: mocks.remove,
      removeDependencyById: mocks.removeById,
    }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.add.mockResolvedValue(undefined);
  mocks.removeById.mockResolvedValue(undefined);
  mocks.detail = {
    identifier: 'T-4',
    status: 'backlog',
    dependenciesSatisfied: false,
    dependencies: [
      {
        dependencyId: 'edge-one',
        dependsOn: 'T-1',
        name: 'First',
        status: 'completed',
        type: 'blocks',
      },
      {
        dependencyId: 'edge-two',
        dependsOn: 'T-2',
        name: 'Second',
        status: 'backlog',
        type: 'blocks',
      },
    ],
  };
  mocks.queryResult = {
    data: { data: [{ id: 'task-three', identifier: 'T-3', name: 'Third' }], hasMore: false },
    error: undefined,
    isLoading: false,
    mutate: mocks.retry,
  };
});

describe('TaskPrerequisites', () => {
  it('shows every prerequisite and the blocked explanation', () => {
    render(<TaskPrerequisites />);
    expect(screen.getByText('T-1 · First')).toBeTruthy();
    expect(screen.getByText('T-2 · Second')).toBeTruthy();
    expect(screen.getByText('taskDetail.prerequisites.blocked')).toBeTruthy();
    fireEvent.click(screen.getByText('T-1 · First'));
    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-1');
  });

  it('adds the selected task using its canonical id', async () => {
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.prerequisites.add' }));
    fireEvent.click(screen.getByRole('button', { name: 'T-3 · Third' }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith('T-4', 'task-three', 'blocks'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('keeps failed mutations visible instead of pretending the dependency was saved', async () => {
    mocks.add.mockRejectedValue(new Error('This prerequisite would create a dependency cycle'));
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.prerequisites.add' }));
    fireEvent.click(screen.getByRole('button', { name: 'T-3 · Third' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('cycle'));
    expect(screen.getByText('T-2 · Second')).toBeTruthy();
  });

  it('unlinks an inaccessible prerequisite by edge id without displaying its identity', async () => {
    mocks.detail.dependencies = [
      { dependencyId: 'hidden-edge', dependsOn: '', inaccessible: true, type: 'blocks' },
    ];
    render(<TaskPrerequisites />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'taskDetail.prerequisites.remove taskDetail.prerequisites.unavailable',
      }),
    );
    await waitFor(() => expect(mocks.removeById).toHaveBeenCalledWith('T-4', 'hidden-edge'));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['running', 'completed'])('does not let a %s task add new prerequisites', (status) => {
    mocks.detail.status = status;
    render(<TaskPrerequisites />);
    expect(
      (screen.getByRole('button', { name: 'taskDetail.prerequisites.add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('leaves the panel readable but mutations disabled for a viewer', () => {
    mocks.allowed = false;
    render(<TaskPrerequisites />);
    expect(
      (screen.getByRole('button', { name: 'taskDetail.prerequisites.add' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'taskDetail.prerequisites.remove T-1',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('distinguishes a loading failure from an empty result and offers retry', () => {
    mocks.queryResult.error = new Error('Network error');
    render(<TaskPrerequisites />);
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.prerequisites.add' }));
    expect(screen.getByRole('alert').textContent).toBe('taskDetail.prerequisites.loadError');
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.prerequisites.retry' }));
    expect(mocks.retry).toHaveBeenCalled();
    expect(screen.queryByText('taskDetail.prerequisites.noResults')).toBeNull();
  });
});

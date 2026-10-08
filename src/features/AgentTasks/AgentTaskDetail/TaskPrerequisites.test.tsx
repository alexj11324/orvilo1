/** @vitest-environment happy-dom */
import type { TaskDetailData } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskPrerequisites, { TaskBlockedNotice } from './TaskPrerequisites';

const mocks = vi.hoisted(() => ({
  addDependency: vi.fn(),
  allowed: true,
  navigate: vi.fn(),
  refreshTaskDetail: vi.fn(),
  removeDependency: vi.fn(),
  removeIssueRelation: vi.fn(),
  search: vi.fn(),
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
vi.mock('@/services/workAttention', () => ({
  workAttentionService: { search: mocks.search },
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    ...props
  }: { children: ReactNode; onClick?: () => void } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} onClick={() => onClick?.()}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ render }: { render?: ReactNode }) => <>{render}</>,
}));

const setTask = (dependencies: TaskDetailData['dependencies'] = [], id = 'T-4') => {
  mocks.state = {
    activeTaskId: id,
    addDependency: mocks.addDependency,
    internal_refreshTaskDetail: mocks.refreshTaskDetail,
    removeDependency: mocks.removeDependency,
    removeIssueRelation: mocks.removeIssueRelation,
    taskDetailMap: { [id]: { dependencies, identifier: id, status: 'backlog' } },
  } as unknown as TaskStore;
};
const key = (suffix: string) => `taskDetail.prerequisites.${suffix}`;
const relation = (suffix: string) => `taskDetail.relations.${suffix}`;
const allKinds = new Set(['blockedBy', 'blocking', 'relates']);
const fieldFor = (kind: string) => {
  const field = document.querySelector(`[data-relation-kind="${kind}"]`);
  if (!field) throw new Error(`Expected relation field ${kind}`);
  return within(field as HTMLElement);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.addDependency.mockResolvedValue(undefined);
  mocks.refreshTaskDetail.mockResolvedValue(undefined);
  mocks.removeDependency.mockResolvedValue(undefined);
  mocks.removeIssueRelation.mockResolvedValue(undefined);
  mocks.search.mockResolvedValue({ data: [] });
  setTask();
});
afterEach(cleanup);

describe('TaskPrerequisites', () => {
  it('renders the three sidebar fields with an add button each and no search until one is chosen', () => {
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    expect(screen.getByText(relation('blockedBy'))).toBeTruthy();
    expect(screen.getByText(relation('blocking'))).toBeTruthy();
    expect(screen.getByText(relation('relates'))).toBeTruthy();
    // An empty field offers only its add button — no filler text.
    expect(screen.queryByText(relation('none'))).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getAllByRole('button', { name: relation('add') })).toHaveLength(3);
  });

  it('hides empty relation fields until they are revealed', () => {
    setTask([{ dependsOn: 'T-3', status: 'backlog', type: 'relates' }]);
    const view = render(<TaskPrerequisites />);
    expect(screen.getByText('T-3')).toBeTruthy();
    expect(document.querySelector('[data-relation-kind="blockedBy"]')).toBeNull();
    expect(document.querySelector('[data-relation-kind="blocking"]')).toBeNull();
    view.rerender(<TaskPrerequisites revealedKinds={new Set(['blocking'])} />);
    expect(document.querySelector('[data-relation-kind="blocking"]')).toBeTruthy();
  });

  it('shows blocking state until every prerequisite completes', () => {
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'backlog', type: 'blocks' },
    ]);
    const view = render(
      <>
        <TaskPrerequisites revealedKinds={allKinds} />
        <TaskBlockedNotice />
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    expect(screen.getByText('T-1')).toBeTruthy();
    expect(screen.getByText('T-2')).toBeTruthy();
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'completed', type: 'blocks' },
    ]);
    view.rerender(
      <>
        <TaskPrerequisites revealedKinds={allKinds} />
        <TaskBlockedNotice />
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe(key('ready'));
  });

  it('lists relates edges in their own field', () => {
    setTask([
      { dependsOn: 'T-1', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-3', status: 'backlog', type: 'relates' },
    ]);
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    expect(fieldFor('blockedBy').getByText('T-1')).toBeTruthy();
    expect(fieldFor('relates').getByText('T-3')).toBeTruthy();
    expect(fieldFor('blocking').queryByText(relation('none'))).toBeNull();
  });

  it('adds a relates edge from search and a blocking edge from the other side', async () => {
    mocks.search.mockResolvedValue({
      data: [{ description: 'T-9', id: 'tsk_9', title: 'Ship it', type: 'task' }],
    });
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    fireEvent.click(fieldFor('relates').getByRole('button', { name: relation('add') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ship' } });
    await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
    fireEvent.click(screen.getByText('Ship it'));
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-9', 'relates'));

    fireEvent.click(fieldFor('blocking').getByRole('button', { name: relation('add') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ship' } });
    await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
    fireEvent.click(screen.getByText('Ship it'));
    await waitFor(() => {
      expect(mocks.addDependency).toHaveBeenCalledWith('T-9', 'T-4', 'blocks');
      expect(mocks.refreshTaskDetail).toHaveBeenCalledWith('T-4');
    });
  });

  it('uses the board workflow glyph for a prerequisite with a provider state', () => {
    setTask([
      {
        dependsOn: 'T-1',
        status: 'backlog',
        type: 'blocks',
        workflowCategory: 'in_progress',
        workflowStateId: 'linear-state-progress',
      },
    ]);
    render(<TaskPrerequisites revealedKinds={allKinds} />);

    const linkedIssue = screen.getByText('T-1').closest('button');
    expect(linkedIssue?.querySelector('svg')).toHaveAttribute('data-workflow-icon', 'in_progress');
  });

  it('keeps unavailable prerequisites blocking but removable by their raw id', async () => {
    setTask([{ dependsOn: 'task_hidden', id: 'task_hidden', status: null, type: 'blocks' }]);
    render(
      <>
        <TaskPrerequisites revealedKinds={allKinds} />
        <TaskBlockedNotice />
      </>,
    );
    expect(screen.getByRole('status').textContent).toBe(key('blocked'));
    // The row composes `identifier · unavailable` — match the composed text,
    // then walk up to the (disabled) navigation button.
    const unavailableText = screen.getByText(new RegExp(key('unavailable')));
    expect(unavailableText.closest('button')?.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: `${key('removeBlocker')}:task_hidden`,
      }),
    );
    await waitFor(() =>
      expect(mocks.removeDependency).toHaveBeenCalledWith('T-4', 'task_hidden', 'blocks'),
    );
  });

  it('unlinks an unreadable prerequisite using only the opaque relation id', async () => {
    const relationId = '5e3d328d-6c4a-46af-88b7-a492268839e1';
    setTask([{ dependsOn: 'Unavailable prerequisite', relationId, status: null, type: 'blocks' }]);
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: `${key('removeBlocker')}:Unavailable prerequisite`,
      }),
    );
    await waitFor(() => expect(mocks.removeIssueRelation).toHaveBeenCalledWith('T-4', relationId));
    expect(mocks.removeDependency).not.toHaveBeenCalled();
  });

  it('gives duplicate unavailable prerequisite removals distinct accessible names', () => {
    setTask([
      {
        dependsOn: 'Unavailable prerequisite',
        relationId: 'edge-hidden-1',
        status: null,
        type: 'blocks',
      },
      {
        dependsOn: 'Unavailable prerequisite',
        relationId: 'edge-hidden-2',
        status: null,
        type: 'blocks',
      },
    ]);
    render(<TaskPrerequisites revealedKinds={allKinds} />);

    const buttons = screen.getAllByRole('button', { name: new RegExp(key('removeBlocker')) });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      `${key('removeBlocker')}:${key('relationPosition')}:Unavailable prerequisite:1`,
      `${key('removeBlocker')}:${key('relationPosition')}:Unavailable prerequisite:2`,
    ]);
  });

  it('renders localized removal errors', async () => {
    setTask([{ dependsOn: 'T-1', id: 'task_1', status: 'backlog', type: 'blocks' }]);
    mocks.removeDependency.mockRejectedValue(new Error('Dependency not found'));
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    fireEvent.click(screen.getByRole('button', { name: `${key('removeBlocker')}:T-1` }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(key('unavailable')));
  });

  it('does not offer mutations to read-only users', () => {
    mocks.allowed = false;
    setTask([{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }]);
    render(<TaskPrerequisites revealedKinds={allKinds} />);
    expect(screen.queryByRole('button', { name: `${key('removeBlocker')}:T-1` })).toBeNull();
    expect(screen.queryByRole('button', { name: relation('add') })).toBeNull();
    expect(screen.getByText('Read only')).toBeTruthy();
  });
});

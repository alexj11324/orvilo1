/** @vitest-environment happy-dom */
import type { TaskDetailData } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskRelatedSection, { TaskBlockedNotice } from './TaskRelatedSection';

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
    t: (key: string, options?: { count?: number; identifier?: string; position?: number }) =>
      [key, options?.identifier, options?.position, options?.count]
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
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
const markAs = (kind: string) => `taskDetail.menu.mark.${kind}`;
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

describe('TaskRelatedSection', () => {
  it('renders the Related group with its one add affordance and no kind rows when empty', () => {
    render(<TaskRelatedSection />);
    // The PropertyGroup header and the relates kind share the "Related" key;
    // with no rows only the group header renders it.
    expect(screen.getByText(relation('relates'))).toBeTruthy();
    // Empty kinds have no header of their own — Linear adds through the
    // group's "Mark current issue as" menu, never through revealed fields.
    expect(document.querySelector('[data-relation-kind]')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    const add = screen.getByRole('button', { name: relation('add') });
    expect(add).toBeTruthy();
    for (const kind of ['blockedBy', 'blocking', 'relatedTo']) {
      expect(screen.getByRole('button', { name: markAs(kind) })).toBeTruthy();
    }
  });

  it('opens an empty kind search from the add menu and closes it again', () => {
    setTask([{ dependsOn: 'T-3', status: 'backlog', type: 'relates' }]);
    render(<TaskRelatedSection />);
    expect(document.querySelector('[data-relation-kind="blocking"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: markAs('blocking') }));
    expect(fieldFor('blocking').getByRole('textbox')).toBeTruthy();
    expect(document.querySelector('[data-relation-kind="blockedBy"]')).toBeNull();

    // The same menu pick toggles the search back off.
    fireEvent.click(screen.getByRole('button', { name: markAs('blocking') }));
    expect(document.querySelector('[data-relation-kind="blocking"]')).toBeNull();
  });

  it('shows only the kinds that have rows, in blockedBy → blocking → relates order', () => {
    setTask([
      { dependsOn: 'T-1', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-2', direction: 'blocking', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-3', status: 'backlog', type: 'relates' },
    ]);
    render(<TaskRelatedSection />);
    const kinds = [...document.querySelectorAll('[data-relation-kind]')].map((node) =>
      node.getAttribute('data-relation-kind'),
    );
    expect(kinds).toEqual(['blockedBy', 'blocking', 'relates']);
    expect(fieldFor('blockedBy').getByText('T-1')).toBeTruthy();
    expect(fieldFor('blocking').getByText('T-2')).toBeTruthy();
    expect(fieldFor('relates').getByText('T-3')).toBeTruthy();
  });

  it('navigates to the linked issue detail path when a row is clicked', () => {
    setTask([{ dependsOn: 'T-3', status: 'backlog', type: 'relates' }]);
    render(<TaskRelatedSection />);
    fireEvent.click(screen.getByText('T-3'));
    expect(mocks.navigate).toHaveBeenCalledWith('/task/T-3');
  });

  it('folds a long list behind "Show N more" in kind order, then expands', () => {
    setTask([
      { dependsOn: 'T-1', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-2', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-3', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-5', direction: 'blocking', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-6', direction: 'blocking', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-7', direction: 'blocking', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-8', direction: 'blocking', status: 'backlog', type: 'blocks' },
      { dependsOn: 'T-9', status: 'backlog', type: 'relates' },
    ]);
    render(<TaskRelatedSection />);
    // Five rows fit: the three blockedBy, then two blocking. The other two
    // blocking rows and the whole relates group fold away.
    expect(fieldFor('blockedBy').getByText('T-3')).toBeTruthy();
    expect(fieldFor('blocking').getByText('T-5')).toBeTruthy();
    expect(fieldFor('blocking').getByText('T-6')).toBeTruthy();
    expect(screen.queryByText('T-7')).toBeNull();
    expect(document.querySelector('[data-relation-kind="relates"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `${relation('showMore')}:3` }));
    expect(screen.getByText('T-7')).toBeTruthy();
    expect(fieldFor('relates').getByText('T-9')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /showMore/ })).toBeNull();
  });

  it('shows blocking state until every prerequisite completes', () => {
    setTask([
      { dependsOn: 'T-1', status: 'completed', type: 'blocks' },
      { dependsOn: 'T-2', status: 'backlog', type: 'blocks' },
    ]);
    const view = render(
      <>
        <TaskRelatedSection />
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
        <TaskRelatedSection />
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
    render(<TaskRelatedSection />);
    expect(fieldFor('blockedBy').getByText('T-1')).toBeTruthy();
    expect(fieldFor('relates').getByText('T-3')).toBeTruthy();
    expect(document.querySelector('[data-relation-kind="blocking"]')).toBeNull();
  });

  it('adds a relates edge from search and a blocking edge from the other side', async () => {
    mocks.search.mockResolvedValue({
      data: [{ description: 'T-9', id: 'tsk_9', title: 'Ship it', type: 'task' }],
    });
    render(<TaskRelatedSection />);
    fireEvent.click(screen.getByRole('button', { name: markAs('relatedTo') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ship' } });
    await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
    // Picking only selects; nothing is written until the selection is submitted.
    fireEvent.click(screen.getByText('Ship it'));
    expect(mocks.addDependency).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^taskDetail\.picker\.add/ }));
    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-9', 'relates'));
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ eligibleFor: { relation: 'dependency', taskId: 'T-4' } }),
    );

    fireEvent.click(screen.getByRole('button', { name: markAs('blocking') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ship' } });
    await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
    fireEvent.click(screen.getByText('Ship it'));
    fireEvent.click(screen.getByRole('button', { name: /^taskDetail\.picker\.add/ }));
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
    render(<TaskRelatedSection />);

    const linkedIssue = screen.getByText('T-1').closest('button');
    expect(linkedIssue?.querySelector('svg')).toHaveAttribute('data-workflow-icon', 'in_progress');
  });

  it('keeps unavailable prerequisites blocking but removable by their raw id', async () => {
    setTask([{ dependsOn: 'task_hidden', id: 'task_hidden', status: null, type: 'blocks' }]);
    render(
      <>
        <TaskRelatedSection />
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
    render(<TaskRelatedSection />);
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
    render(<TaskRelatedSection />);

    const buttons = screen.getAllByRole('button', { name: new RegExp(key('removeBlocker')) });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      `${key('removeBlocker')}:${key('relationPosition')}:Unavailable prerequisite:1`,
      `${key('removeBlocker')}:${key('relationPosition')}:Unavailable prerequisite:2`,
    ]);
  });

  it('adds several picked issues in one submit and names why one was refused', async () => {
    mocks.search.mockResolvedValue({
      data: [
        { description: 'T-8', id: 'tsk_8', title: 'Loop back', type: 'task' },
        { description: 'T-9', id: 'tsk_9', title: 'Ship it', type: 'task' },
      ],
    });
    // The server's prose says nothing useful; only its stable code may decide the copy.
    mocks.addDependency.mockImplementation(async (_taskId: string, dependsOn: string) => {
      if (dependsOn === 'T-8')
        throw Object.assign(new Error('nope'), {
          data: { code: 'BAD_REQUEST', errorData: { code: 'CYCLE' } },
        });
    });
    render(<TaskRelatedSection />);
    fireEvent.click(screen.getByRole('button', { name: markAs('blockedBy') }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'i' } });
    await waitFor(() => expect(screen.getByText('Ship it')).toBeTruthy());
    fireEvent.click(screen.getByText('Loop back'));
    fireEvent.click(screen.getByText('Ship it'));
    fireEvent.click(screen.getByRole('button', { name: /^taskDetail\.picker\.add/ }));

    await waitFor(() => expect(mocks.addDependency).toHaveBeenCalledTimes(2));
    expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-8', 'blocks');
    expect(mocks.addDependency).toHaveBeenCalledWith('T-4', 'T-9', 'blocks');
    // The refused issue stays picked and is named with the specific reason.
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('taskDetail.picker.notAdded:T-8'),
    );
    expect(screen.getByText('Loop back').closest('button')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders localized removal errors', async () => {
    setTask([{ dependsOn: 'T-1', id: 'task_1', status: 'backlog', type: 'blocks' }]);
    // Classified by the server's stable reason code, not by the message text.
    mocks.removeDependency.mockRejectedValue(
      Object.assign(new Error('gone'), {
        data: { code: 'BAD_REQUEST', errorData: { code: 'UNAVAILABLE' } },
      }),
    );
    render(<TaskRelatedSection />);
    fireEvent.click(screen.getByRole('button', { name: `${key('removeBlocker')}:T-1` }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'taskDetail.relationError.unavailable:T-4',
      ),
    );
  });

  it('does not guess a removal reason from the wording of an uncoded failure', async () => {
    setTask([{ dependsOn: 'T-1', id: 'task_1', status: 'backlog', type: 'blocks' }]);
    mocks.removeDependency.mockRejectedValue({ data: { code: 'INTERNAL_SERVER_ERROR' } });
    render(<TaskRelatedSection />);
    fireEvent.click(screen.getByRole('button', { name: `${key('removeBlocker')}:T-1` }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(key('error')));
  });

  it('does not offer mutations to read-only users', () => {
    mocks.allowed = false;
    setTask([{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }]);
    render(<TaskRelatedSection />);
    expect(screen.queryByRole('button', { name: `${key('removeBlocker')}:T-1` })).toBeNull();
    expect(screen.queryByRole('button', { name: relation('add') })).toBeNull();
    expect(screen.getByText('Read only')).toBeTruthy();
  });
});

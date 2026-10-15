/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskStore } from '@/store/task';

import TaskIssueResources from './TaskIssueResources';

interface MenuItem {
  disabled?: boolean;
  key?: string;
  label?: ReactNode;
  onClick?: (info?: unknown) => void;
}

const mocks = vi.hoisted(() => ({
  allowed: true,
  confirmModal: vi.fn(),
  links: [] as Array<{ id: string; kind: string; title: string; url: string }>,
  openResourceModal: vi.fn(),
  openTitleModal: vi.fn(),
  refresh: vi.fn(),
  state: {
    activeTaskId: 'T-1',
    taskDetailMap: {} as Record<string, Record<string, unknown>>,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({
    allowed: mocks.allowed,
    reason: mocks.allowed ? undefined : 'Read only',
  }),
}));

vi.mock('@/libs/swr', () => ({
  mutate: vi.fn(),
  useClientDataSWR: () => ({
    data: { data: mocks.links },
    error: undefined,
    isLoading: false,
    mutate: mocks.refresh,
  }),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: TaskStore) => unknown) =>
    selector(mocks.state as unknown as TaskStore),
}));

vi.mock('@/services/taskMenu', () => ({
  taskMenuService: { links: vi.fn(), removeLink: vi.fn() },
}));

vi.mock('./createTaskIssueResourceModal', () => ({
  openTaskIssueResourceModal: mocks.openResourceModal,
}));

vi.mock('./TaskIssueRelationModal', () => ({
  openTaskIssueRelationModal: vi.fn(),
}));

vi.mock('./TaskIssueResourceTitleModal', () => ({
  openTaskIssueResourceTitleModal: mocks.openTitleModal,
}));

vi.mock('@/components/Modal', () => ({
  confirmModal: mocks.confirmModal,
}));

// Render the menu's entries as plain buttons so a pick does not need a real
// dropdown portal.
vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ children, items }: { children: ReactNode; items: MenuItem[] }) => (
    <>
      {children}
      {items?.map((item) => (
        <button key={item.key} type="button" onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </>
  ),
}));

const setDetail = (detail: Record<string, unknown>) => {
  mocks.state.taskDetailMap = { 'T-1': { identifier: 'T-1', ...detail } };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.links = [];
  // A fully loaded issue: the resource commands need its database id and a
  // domainRevision before they can run.
  setDetail({ domainRevision: 3, id: 'task_db_1' });
});

afterEach(cleanup);

describe('TaskIssueResources', () => {
  it('keeps the header "+" menu on an empty issue so the first attachment can be added', () => {
    render(<TaskIssueResources />);

    expect(screen.getByRole('button', { name: 'taskDetail.resources.add' })).toBeInTheDocument();

    // The one "+" menu covers all three kinds the retired chip row offered.
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.add.link' }));
    expect(mocks.openResourceModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'link', taskId: 'task_db_1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.add.pull_request' }));
    expect(mocks.openResourceModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'pull_request', taskId: 'task_db_1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.menu.add.document' }));
    expect(mocks.openResourceModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'document', taskId: 'task_db_1' }),
    );
  });

  it('renders nothing for a viewer with nothing attached', () => {
    mocks.allowed = false;
    const { container } = render(<TaskIssueResources />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden until the issue has the ids the resource commands need', () => {
    setDetail({ id: 'task_db_1' });
    const { container } = render(<TaskIssueResources />);
    // canAddResource is false without a domainRevision, so no empty header
    // and no "+" shows up during the detail-loading window.
    expect(container).toBeEmptyDOMElement();
  });

  it('lists attached resources next to the same add menu once they exist', () => {
    mocks.links = [
      { id: 'lnk_1', kind: 'link', title: 'Spec', url: 'https://example.com/spec' },
      { id: 'lnk_2', kind: 'pull_request', title: 'PR #9', url: 'https://example.com/pr/9' },
    ];
    render(<TaskIssueResources />);

    expect(screen.getByText('Spec').closest('a')).toHaveAttribute(
      'href',
      'https://example.com/spec',
    );
    expect(screen.getByText('PR #9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'taskDetail.resources.add' })).toBeInTheDocument();
  });
});

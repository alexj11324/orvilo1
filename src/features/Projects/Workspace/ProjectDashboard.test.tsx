import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '@/store/project';

import { ProjectPanelSection } from '../Layout/ProjectSidePanel';
import { ProjectUpdateComposer, ProjectUpdateRow } from '../Updates';
import ProjectWorkspace from './index';
import ProjectDashboard from './ProjectDashboard';
import ProjectDescription from './ProjectDescription';
import { ProjectOverviewField } from './ProjectOverviewField';
import ProjectPropertiesCard from './ProjectPropertiesCard';

const mocks = vi.hoisted(() => ({
  goalSWR: { data: undefined as unknown, error: undefined, isLoading: false, mutate: vi.fn() },
  goals: [] as { goal: { id: string; status: string; title: string } }[],
  navigate: vi.fn(),
  projectMembersQuery: vi.fn(() => ({
    data: [],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  })),
  projectResolved: true,
}));

// Only the dashboard/panel components are under test; shell components are
// stand-ins so the assertions read the data, not markup details.
vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Block: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ title }: { title?: ReactNode }) => <div>{title}</div>,
  Flexbox: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Icon: () => null,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  TextArea: () => <textarea />,
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Tag: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws_1',
}));

vi.mock('@/components/AsyncError', () => ({ default: () => null }));
vi.mock('@/components/Skeleton', () => ({ ArticleSkeleton: () => null }));

vi.mock('@/business/client/hooks/useWorkspaceCapabilities', () => ({
  useWorkspaceCapabilities: () => ({
    canGrantAdmin: false,
    canInvite: false,
    canLeave: false,
    canManageMembers: false,
    isOwner: false,
    role: null,
  }),
}));

vi.mock('@/features/Teammates/api/hooks', () => ({
  useProjectMembersQuery: mocks.projectMembersQuery,
}));

vi.mock('@/features/Teammates/useTeammatesEnabled', () => ({
  useTeammatesEnabled: () => true,
}));

vi.mock('react-router', () => ({ useParams: () => ({ projectId: 'apollo' }) }));
vi.mock('@/components/Avatar', () => ({ default: () => null }));
vi.mock('@/components/NeuralNetworkLoading', () => ({ default: () => null }));
vi.mock('@/features/AgentTasks/features/AssigneeUserAvatar', () => ({ default: () => null }));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/services/project', () => ({ projectService: { updateStatus: vi.fn() } }));
vi.mock('@/store/project', () => ({
  useCurrentProjectDetail: () => (mocks.projectResolved ? detail : undefined),
  useProjectStore: () => () => ({ error: undefined, isLoading: false, mutate: vi.fn() }),
}));

vi.mock('@/features/Work/WorkSummaryCard', () => ({
  default: ({ item }: { item: { id: string } }) => <div data-work={item.id} />,
}));

vi.mock('@/features/WorkGallery/useOpenWork', () => ({ useOpenWork: () => vi.fn() }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/libs/swr', () => ({
  useClientDataSWR: () => ({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/store/goal', () => ({
  goalSelectors: { goalList: () => () => mocks.goals },
  useGoalStore: (selector: (state: unknown) => unknown) =>
    selector({ useFetchGoals: () => mocks.goalSWR }),
}));

const detail = {
  agents: [],
  completionReviews: [],
  dependencies: [],
  goals: [],
  knowledgeBases: [],
  labels: [],
  members: [],
  milestones: [],
  project: { coordinatorAgentId: 'agt_coordinator', id: 'prj_1', name: 'Apollo', slug: 'apollo' },
  tasks: [],
  teams: [],
} as unknown as ProjectDetail;

beforeEach(() => {
  mocks.projectResolved = true;
  mocks.projectMembersQuery.mockClear();
  mocks.navigate.mockClear();
  mocks.goals = [];
});

afterEach(cleanup);

const renderCharts = () => render(<ProjectDashboard detail={detail} projectId={'prj_1'} />);

describe('project sidebar sections', () => {
  it('collapses and reopens its content while exposing the disclosure relationship', () => {
    render(
      <ProjectPanelSection title="Properties">
        <button>Change priority</button>
      </ProjectPanelSection>,
    );
    const trigger = screen.getByRole('button', { name: 'overview.collapseSection' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toContainElement(
      screen.getByRole('button', { name: 'Change priority' }),
    );
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Change priority' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Change priority' })).toBeVisible();
  });
});

describe('project update composer controls', () => {
  it('renders persisted Markdown formatting instead of showing its source markers', () => {
    render(
      <ProjectUpdateRow
        update={{
          id: 'update_1',
          projectId: 'prj_1',
          authorId: 'user_1',
          body: '**Launch ready**',
          createdAt: '2026-09-22T00:00:00Z',
          kind: 'comment',
        }}
      />,
    );
    expect(screen.getByText('Launch ready').tagName).toBe('STRONG');
    expect(screen.queryByText('**Launch ready**')).not.toBeInTheDocument();
  });
  it('starts in comment mode when Activity is opened without an update intent', () => {
    render(<ProjectUpdateComposer defaultExpanded defaultMode="comment" projectId="prj_1" />);
    expect(screen.getByRole('textbox', { name: 'overview.commentEditor' })).toHaveAttribute(
      'contenteditable',
      'true',
    );
    expect(screen.getByRole('button', { name: 'overview.postComment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /onTrack|On track/ })).not.toBeInTheDocument();
  });
  it('offers a keyboard-accessible overview entry that calls the navigation handler', () => {
    const onExpand = vi.fn();
    render(<ProjectUpdateComposer projectId="prj_1" onExpand={onExpand} />);
    const entry = screen.getByRole('button', {
      name: /Write a project update|overview.updatePlaceholder/,
    });
    expect(entry).toHaveAttribute('type', 'button');
    fireEvent.click(entry);
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('names the post action for the selected mode and removes health in comment mode', () => {
    render(<ProjectUpdateComposer defaultExpanded projectId="prj_1" />);
    expect(screen.getByRole('button', { name: 'overview.postUpdate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /onTrack|On track/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /updateModeComment|Comment/ }));
    expect(screen.getByRole('button', { name: 'overview.postComment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /onTrack|On track/ })).not.toBeInTheDocument();
  });
});

describe('project description disclosure', () => {
  it('renders new server descriptions and empty content without requiring an edit-mode click', async () => {
    const { rerender } = render(<ProjectDescription description="Initial" projectId="prj_1" />);
    const editor = await screen.findByRole('textbox', { name: 'overview.descriptionEditor' });
    rerender(<ProjectDescription description="**Revised**" projectId="prj_1" />);
    await waitFor(() => expect(editor.querySelector('strong')).toHaveTextContent('Revised'));
    rerender(<ProjectDescription description="" projectId="prj_1" />);
    await waitFor(() => expect(editor.textContent).toBe(''));
    expect(screen.queryByRole('button', { name: /descriptionSave|Save/ })).not.toBeInTheDocument();
  });

  it('exposes an immediately editable rich description and preserves it across disclosure toggles', async () => {
    render(<ProjectDescription description="**Project scope**" projectId="prj_1" />);
    const disclosure = screen.getByRole('button', { name: 'overview.descriptionLabel' });
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const entry = await screen.findByRole('textbox', { name: 'overview.descriptionEditor' });
    expect(entry).toHaveAttribute('contenteditable', 'true');
    await waitFor(() => expect(entry.querySelector('strong')).toHaveTextContent('Project scope'));
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    expect(screen.getByRole('textbox', { name: 'overview.descriptionEditor' })).toBe(entry);
  });
});

describe('project overview inline fields', () => {
  it('saves an empty summary without substituting a description', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<ProjectOverviewField kind="summary" value="Original" onSave={save} />);
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    await waitFor(() => expect(save).toHaveBeenCalledWith(''));
  });

  it('cancels drafts with Escape and does not save a blank name', () => {
    const save = vi.fn();
    render(<ProjectOverviewField kind="name" value="Apollo" onSave={save} />);
    const field = screen.getByRole('textbox');
    field.focus();
    fireEvent.change(field, { target: { value: 'Draft' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('Apollo');
    expect(save).not.toHaveBeenCalled();
    field.focus();
    fireEvent.change(field, { target: { value: '  ' } });
    fireEvent.blur(field);
    expect(field).toHaveValue('Apollo');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a rejected draft and allows retry', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(undefined);
    try {
      render(<ProjectOverviewField kind="summary" value="Original" onSave={save} />);
      const field = screen.getByRole('textbox');
      fireEvent.change(field, { target: { value: 'Draft' } });
      fireEvent.blur(field);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(field).toHaveValue('Draft');
      fireEvent.blur(field);
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(save).toHaveBeenCalledTimes(2);
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe('project dashboard milestones', () => {
  it('renders the project milestones section', () => {
    render(
      <ProjectDashboard
        projectId={'prj_1'}
        detail={{
          ...detail,
          milestones: [
            {
              date: '2026-10-01',
              description: 'Release the parity pass',
              id: 'milestone_1',
              name: 'Ship the parity pass',
              projectId: 'prj_1',
              sortOrder: 0,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('overview.milestones')).toBeInTheDocument();
    expect(screen.getByText('Ship the parity pass')).toBeInTheDocument();
    expect(screen.queryByText('overview.milestonesEmpty')).not.toBeInTheDocument();
  });

  it('shows the empty state when the project has no milestones', () => {
    renderCharts();
    expect(screen.getByText('overview.milestonesEmpty')).toBeInTheDocument();
  });
});

describe('project overview member scope', () => {
  it('does not query members until the project resolves', () => {
    mocks.projectResolved = false;
    render(<ProjectWorkspace />);
    expect(mocks.projectMembersQuery).toHaveBeenCalledWith(undefined, false);
  });

  it('loads members using the resolved project ID when the route uses a slug', () => {
    render(<ProjectWorkspace />);
    expect(mocks.projectMembersQuery).toHaveBeenCalledWith('prj_1', true);
    expect(mocks.projectMembersQuery).not.toHaveBeenCalledWith('apollo', true);
  });
});

describe('project properties planning metadata', () => {
  it('renders priority, precision dates, labels, and teams', () => {
    render(
      <ProjectPropertiesCard
        projectId={'prj_1'}
        detail={{
          ...detail,
          labels: [{ id: 'label_ui', name: 'UI parity' }] as NonNullable<ProjectDetail['labels']>,
          project: {
            ...detail.project,
            priority: 2,
            startDate: '2026-09-21',
            startDatePrecision: 'month',
            targetDate: '2027-02-01',
            targetDatePrecision: 'quarter',
          },
          teams: [{ id: 'team_1', name: 'orvilo' }] as NonNullable<ProjectDetail['teams']>,
        }}
      />,
    );

    expect(screen.getByText('create.priority.high')).toBeInTheDocument();
    expect(screen.getByText('Sep 2026 → 2027 Q1')).toBeInTheDocument();
    expect(screen.getByText('UI parity')).toBeInTheDocument();
    expect(screen.getByText('orvilo')).toBeInTheDocument();
  });
});

import type { ProjectStatus } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssVar } from 'antd-style';
import { BoxIcon, CalendarDaysIcon, CalendarIcon, DiamondIcon } from 'lucide-react';
import type { HTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import { useState, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import { MILESTONE_ICON_PAINT, MILESTONE_ICON_SIZE } from '@/features/Projects/milestoneRow';
import { ProjectActiveStatusIcon } from '@/features/Projects/ProjectActiveStatusIcon';
import { MUTED_LABEL_COLOR } from '@/features/Projects/sectionLabel';
import { projectService } from '@/services/project';
import type { ProjectDetail, ProjectListItem } from '@/store/project';

import { ProjectCreationActivity } from '../Activity/ProjectCreationActivity';
import { ProjectIssueProgress } from '../Layout/ProjectIssueProgress';
import ProjectSidePanel, { ProjectPanelSection } from '../Layout/ProjectSidePanel';
import ProjectTabsBar from '../Layout/TabsBar';
import ProjectListPage from '../List';
import { ProjectUpdateComposer, ProjectUpdateRow } from '../Updates';
import ProjectWorkspace from './index';
import ProjectDashboard from './ProjectDashboard';
import ProjectDescription from './ProjectDescription';
import { ProjectMembersField } from './ProjectMembersField';
import { ProjectOverviewField } from './ProjectOverviewField';
import { ProjectDateField } from './ProjectPlanningFields';
import ProjectPropertiesCard from './ProjectPropertiesCard';

const mocks = vi.hoisted(() => ({
  canManageMembers: false,
  canInvite: false,
  openInvite: vi.fn(),
  workspaceRole: null as string | null,
  workspaceMembers: [] as {
    userId: string;
    user: { fullName: string };
    deletedAt: null;
    suspendedAt: null;
  }[],
  addProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
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
  projectStatus: 'active',
  serverStatus: 'active',
  completedReviewId: null as string | null,
  projectVersion: 0,
  projectListeners: new Set<() => void>(),
  detailMutate: vi.fn(),
  // Props every `Icon` on the page rendered with. The stub below renders
  // nothing, so this is the only way a test can read the visual spec back.
  iconProps: [] as Record<string, unknown>[],
  // Same for `Text`, which the stub flattens to a bare span.
  textProps: [] as Record<string, unknown>[],
  // And for `Tag`, which takes its glyph as an `icon` *element*: that element
  // is never mounted by the stub, so its props are only readable here.
  tagProps: [] as Record<string, unknown>[],
  // `Flexbox` props, **keyed by the node the stub produced**. A list would have
  // to be told which entry is the container under test; the render order that
  // decides that is not a fact about the component. Reading them back off the
  // `<div>` is not an option either: `gap` is a prop the stub flattens into an
  // attribute that the real component never renders — a layout change that
  // moved `gap` into CSS would fail such a test without touching the layout.
  flexboxProps: new WeakMap<Element, Record<string, unknown>>(),
  // Milestones the mocked project detail resolves to; `[]` by default so the
  // existing empty-state assertions keep their fixture.
  milestones: [] as NonNullable<ProjectDetail['milestones']>,
  // Rows the mocked project list resolves to; empty unless a test seeds it.
  projectList: [] as ProjectListItem[],
}));

// Only the dashboard/panel components are under test; shell components are
// stand-ins so the assertions read the data, not markup details.
vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Block: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ title }: { title?: ReactNode }) => <div>{title}</div>,
  Flexbox: (props: { children?: ReactNode } & HTMLAttributes<HTMLDivElement>) => {
    const { children, ...rest } = props;
    return (
      <div
        {...rest}
        ref={(node) => {
          if (node) mocks.flexboxProps.set(node, props as Record<string, unknown>);
        }}
      >
        {children}
      </div>
    );
  },
  Icon: (props: Record<string, unknown>) => {
    mocks.iconProps.push(props);
    return null;
  },
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  TextArea: () => <textarea />,
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({
    children,
    items,
  }: {
    children?: ReactNode;
    items?: { key: string; label: ReactNode; onClick: () => void }[];
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <div
        role="presentation"
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setOpen(true);
        }}
      >
        {children}
        {open && (
          <div role="menu">
            {items?.map((item) => (
              <button
                key={item.key}
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
  Tag: (props: { children?: ReactNode; icon?: ReactNode } & Record<string, unknown>) => {
    mocks.tagProps.push(props);
    return <span>{props.children}</span>;
  },
  Text: (props: { children?: ReactNode } & Record<string, unknown>) => {
    mocks.textProps.push(props);
    return <span>{props.children}</span>;
  },
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws_1',
}));

vi.mock('@/components/AsyncError', () => ({ default: () => null }));
vi.mock('@/components/Skeleton', () => ({ ArticleSkeleton: () => null }));

vi.mock('@/business/client/hooks/useWorkspaceCapabilities', () => ({
  useWorkspaceCapabilities: () => ({
    canGrantAdmin: false,
    canInvite: mocks.canInvite,
    canLeave: false,
    canManageMembers: mocks.canManageMembers,
    isOwner: false,
    role: mocks.workspaceRole,
  }),
}));

vi.mock('@/features/Teammates/api/hooks', () => ({
  useProjectMembersQuery: mocks.projectMembersQuery,
  useTeammateActions: () => ({
    addProjectMember: mocks.addProjectMember,
    removeProjectMember: mocks.removeProjectMember,
    mutating: false,
  }),
  useWorkspaceMembersQuery: () => ({
    data: mocks.workspaceMembers,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/features/Teammates/InviteTeammateModal', () => ({
  openInviteTeammateModal: mocks.openInvite,
}));

vi.mock('@/features/Teammates/useTeammatesEnabled', () => ({
  useTeammatesEnabled: () => true,
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/acme/project/apollo/activity' }),
  useParams: () => ({ projectId: 'apollo' }),
}));
vi.mock('@/features/HomeSidebar/Body/WorkFavoriteButton', () => ({ default: () => null }));
vi.mock('@/features/NavHeader', () => ({ default: () => null }));
vi.mock('@/features/NavPanel/SidebarHeaderSelect', () => ({
  SidebarHeaderSelectPopover: () => null,
  SidebarHeaderSelectTrigger: () => null,
}));
vi.mock('@/features/NavPanel/switcher/SwitcherMenu', () => ({ default: () => null }));
vi.mock('@/components/Avatar', () => ({ default: () => null }));
vi.mock('@/components/NeuralNetworkLoading', () => ({ default: () => null }));
vi.mock('@/features/AgentTasks/features/AssigneeUserAvatar', () => ({ default: () => null }));
vi.mock('@/store/user', () => ({ useUserStore: () => 'user_1' }));
vi.mock('@/services/project', () => ({ projectService: { updateStatus: vi.fn() } }));
vi.mock('@/store/project', () => ({
  useCurrentProjectList: () => mocks.projectList,
  useCurrentProjectDetail: () => {
    useSyncExternalStore(
      (listener) => {
        mocks.projectListeners.add(listener);
        return () => mocks.projectListeners.delete(listener);
      },
      () => mocks.projectVersion,
    );
    return mocks.projectResolved
      ? {
          ...detail,
          project: {
            ...detail.project,
            completedReviewId: mocks.completedReviewId,
            status: mocks.projectStatus,
          },
          milestones: mocks.milestones,
        }
      : undefined;
  },
  useProjectStore: () => () => ({ error: undefined, isLoading: false, mutate: mocks.detailMutate }),
}));

vi.mock('@/features/Work/WorkSummaryCard', () => ({
  default: ({ item }: { item: { id: string } }) => <div data-work={item.id} />,
}));

vi.mock('@/features/WorkGallery/useOpenWork', () => ({ useOpenWork: () => vi.fn() }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
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
  project: {
    coordinatorAgentId: 'agt_coordinator',
    createdAt: '2026-09-20T12:00:00Z',
    id: 'prj_1',
    name: 'Apollo',
    slug: 'apollo',
  },
  tasks: [],
  teams: [],
} as unknown as ProjectDetail;

const milestone = {
  accessedAt: new Date('2026-09-20T12:00:00Z'),
  createdAt: new Date('2026-09-20T12:00:00Z'),
  date: '2026-10-01',
  description: 'Release the parity pass',
  id: 'ms_1',
  name: 'Ship the parity pass',
  projectId: 'prj_1',
  sortOrder: 0,
  progress: null,
  updatedAt: new Date('2026-09-20T12:00:00Z'),
} satisfies NonNullable<ProjectDetail['milestones']>[number];

const withMilestone = { ...detail, milestones: [milestone] };

const milestoneWithProgress = {
  ...milestone,
  progress: { completed: 2, issues: 2, percent: 100 },
};

/** Every diamond glyph the page drew, with the props it was drawn with. */
const renderedDiamonds = () => mocks.iconProps.filter((props) => props.icon === DiamondIcon);

it('exposes project sections as destination links with one current page, not tab buttons', () => {
  render(<ProjectTabsBar />);
  expect(screen.getByRole('link', { name: 'sections.overview' })).toHaveAttribute(
    'href',
    '/project/apollo/overview',
  );
  expect(screen.getByRole('link', { name: 'sections.activity' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: 'sections.issues' })).toHaveAttribute(
    'href',
    '/project/apollo/tasks',
  );
  expect(
    screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page'),
  ).toHaveLength(1);
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});

beforeEach(() => {
  mocks.canManageMembers = false;
  mocks.canInvite = false;
  mocks.openInvite.mockClear();
  mocks.workspaceRole = null;
  mocks.workspaceMembers = [];
  mocks.addProjectMember.mockReset().mockResolvedValue(true);
  mocks.removeProjectMember.mockReset().mockResolvedValue(true);
  mocks.projectResolved = true;
  mocks.projectStatus = 'active';
  mocks.serverStatus = 'active';
  mocks.completedReviewId = null;
  mocks.projectVersion = 0;
  mocks.projectListeners.clear();
  mocks.detailMutate.mockReset().mockImplementation(async () => {
    mocks.projectStatus = mocks.serverStatus;
    mocks.projectVersion += 1;
    for (const listener of mocks.projectListeners) listener();
  });
  mocks.projectMembersQuery.mockClear();
  mocks.navigate.mockClear();
  mocks.goals = [];
  mocks.iconProps = [];
  mocks.textProps = [];
  mocks.tagProps = [];
  mocks.milestones = [];
  mocks.projectList = [];
});

afterEach(cleanup);

const renderCharts = () => render(<ProjectDashboard detail={detail} projectId={'prj_1'} />);

describe('project membership editing', () => {
  const member = { projectId: 'prj_1', role: 'manager' as const, userId: 'user_1', user: null };
  const query = {
    data: [member],
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  };

  it('opens a project-scoped invitation without treating the command as a member', async () => {
    mocks.canManageMembers = true;
    mocks.canInvite = true;
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    await userEvent.click(await screen.findByRole('option', { name: 'properties.inviteAndAdd' }));
    expect(mocks.openInvite).toHaveBeenCalledWith({
      defaultProjectIds: ['prj_1'],
      onClosed: expect.any(Function),
    });
    expect(mocks.addProjectMember).not.toHaveBeenCalled();
    expect(mocks.removeProjectMember).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'properties.members' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    expect(screen.getByRole('combobox', { name: 'properties.members' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    mocks.openInvite.mock.calls[0][0].onClosed();
    await userEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    expect(screen.getByRole('combobox', { name: 'properties.members' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('does not offer workspace invitations to a project-only manager', async () => {
    mocks.workspaceRole = 'member';
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    expect(
      screen.queryByRole('option', { name: 'properties.inviteAndAdd' }),
    ).not.toBeInTheDocument();
  });

  it('keeps workspace viewers read-only even when their project role is manager', () => {
    mocks.workspaceRole = 'viewer';
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    expect(screen.getByRole('combobox', { name: 'properties.members' })).toBeDisabled();
  });

  it('allows active project managers to edit without workspace administration rights', () => {
    mocks.workspaceRole = 'member';
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    expect(screen.getByRole('combobox', { name: 'properties.members' })).not.toBeDisabled();
  });

  it('allows removing a selected member who is no longer in the workspace roster', async () => {
    mocks.canManageMembers = true;
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    const option = await screen.findByRole('option', { name: 'user_1' });
    expect(option).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(option);
    await waitFor(() => expect(mocks.removeProjectMember).toHaveBeenCalledWith('prj_1', 'user_1'));
    expect(mocks.addProjectMember).not.toHaveBeenCalled();
  });

  it('adds only the new member without rewriting the existing manager role', async () => {
    mocks.canManageMembers = true;
    mocks.workspaceMembers = [
      { userId: 'user_2', user: { fullName: 'New teammate' }, deletedAt: null, suspendedAt: null },
    ];
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'properties.members' }));
    await userEvent.click(await screen.findByRole('option', { name: 'New teammate' }));
    await waitFor(() => expect(mocks.addProjectMember).toHaveBeenCalledTimes(1));
    expect(mocks.addProjectMember).toHaveBeenCalledWith('prj_1', 'user_2', 'contributor');
    expect(mocks.removeProjectMember).not.toHaveBeenCalled();
  });

  it('does not display an unsuccessful addition as saved membership', async () => {
    mocks.canManageMembers = true;
    mocks.addProjectMember.mockResolvedValue(false);
    mocks.workspaceMembers = [
      { userId: 'user_2', user: { fullName: 'New teammate' }, deletedAt: null, suspendedAt: null },
    ];
    render(<ProjectMembersField projectId="prj_1" query={query} />);
    const trigger = screen.getByRole('combobox', { name: 'properties.members' });
    fireEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: 'New teammate' }));
    await waitFor(() => expect(mocks.addProjectMember).toHaveBeenCalledTimes(1));
    expect(trigger).not.toHaveTextContent('New teammate');
    expect(trigger).toHaveTextContent('user_1');
  });
});

describe('project sidebar sections', () => {
  it('uses issue workflow counts, not the independent goal completion percentage', () => {
    mocks.goals = [{ goal: { id: 'goal_1', status: 'achieved', title: 'Unrelated goal' } }];
    render(<ProjectSidePanel projectId="apollo" />);
    expect(screen.getByText('overview.progress.scope').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByText('overview.progress.started').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByText('overview.progress.completed').nextElementSibling).toHaveTextContent(
      '0',
    );
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('reports missing issue data as unavailable rather than zero progress', () => {
    render(<ProjectIssueProgress issues={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('overview.progressUnavailable');
    expect(screen.queryByText('overview.progress.scope')).not.toBeInTheDocument();
  });

  it('shows real project creation on Overview and links to full Activity without keeping a redundant card there', () => {
    const { rerender } = render(<ProjectSidePanel showActivity projectId="apollo" />);
    expect(screen.getByText(/^activity.created/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'activity.seeAll' })).toHaveAttribute(
      'href',
      '/project/apollo/activity',
    );
    expect(document.querySelector('time')).toHaveAttribute('datetime', '2026-09-20T12:00:00.000Z');
    rerender(<ProjectSidePanel projectId="apollo" showActivity={false} />);
    expect(screen.queryByRole('link', { name: 'activity.seeAll' })).not.toBeInTheDocument();
  });

  it('attributes creation only to the immutable audit snapshot, and never invents a missing timestamp', () => {
    const { rerender } = render(
      <ProjectCreationActivity
        project={{
          ...detail.project,
          createdBySnapshot: { displayName: 'Original creator', kind: 'user' },
        }}
      />,
    );
    expect(screen.getByText(/^activity.createdBy/)).toBeInTheDocument();
    rerender(<ProjectCreationActivity project={{ ...detail.project, createdBySnapshot: null }} />);
    expect(screen.queryByText(/^activity.createdBy/)).not.toBeInTheDocument();
    expect(screen.getByText(/^activity.created/)).toBeInTheDocument();
    rerender(
      <ProjectCreationActivity project={{ ...detail.project, createdAt: new Date('invalid') }} />,
    );
    expect(document.querySelector('time')).toBeNull();
  });

  it('collapses and reopens its content while exposing the disclosure relationship', () => {
    render(
      <ProjectPanelSection title="Properties">
        <button>Change priority</button>
      </ProjectPanelSection>,
    );
    const trigger = screen.getByRole('button', { name: 'overview.collapseSection' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const disclosureIcon = trigger.querySelector('svg');
    expect(disclosureIcon).toHaveAttribute('viewBox', '0 0 16 16');
    expect(disclosureIcon).toHaveAttribute('width', '16');
    expect(disclosureIcon?.querySelector('path')).toHaveAttribute(
      'd',
      'M7.002 10.624a.5.5 0 01-.752-.432V5.808a.5.5 0 01.752-.432l3.758 2.192a.5.5 0 010 .864l-3.758 2.192z',
    );
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
          milestones: [{ ...milestone, id: 'milestone_1' }],
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

// Linear's milestone row is clickable: the diamond is an anchor into the page.
// The candidate shipped the icon as a bare glyph, so nothing could be opened
// from either surface.
describe('project milestone rows', () => {
  // The DOM env cannot scroll, so the call itself is the observable behaviour.
  // Capture it together with the element it was called on, the way
  // `useScrollActiveThreadIntoView.test.tsx` does.
  const scrolls: { el: Element; options: unknown }[] = [];
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  beforeEach(() => {
    scrolls.length = 0;
    Element.prototype.scrollIntoView = vi.fn(function (this: Element, options: unknown) {
      scrolls.push({ el: this, options });
    });
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('anchors each overview milestone row and links its icon to that row', () => {
    render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);

    expect(screen.getByRole('link', { name: milestone.name })).toHaveAttribute(
      'href',
      '#milestone-ms_1',
    );
    const target = document.getElementById('milestone-ms_1');
    expect(target).not.toBeNull();
    expect(target).toHaveTextContent(milestone.name);
  });

  it('scrolls the overview row into view when its icon is clicked', () => {
    render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);
    fireEvent.click(screen.getByRole('link', { name: milestone.name }));

    expect(scrolls).toHaveLength(1);
    expect(scrolls[0].el).toBe(document.getElementById('milestone-ms_1'));
    expect(scrolls[0].options).toEqual({ behavior: 'smooth', block: 'center' });
  });

  it('does not animate the scroll when the reader asked for reduced motion', () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    try {
      render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);
      fireEvent.click(screen.getByRole('link', { name: milestone.name }));
      expect(scrolls[0].options).toEqual({ behavior: 'auto', block: 'center' });
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('keeps the rail row inert and puts the filtered issues behind See issues', () => {
    mocks.milestones = [milestoneWithProgress];
    render(<ProjectSidePanel projectId="apollo" />);

    // The reference row has no href and `cursor: default`; "go to issues" is a
    // separate hover-revealed control pointing at the milestone-filtered list.
    expect(
      screen.queryByRole('button', { name: new RegExp(milestone.name) }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(milestone.name));
    expect(mocks.navigate).not.toHaveBeenCalled();

    // Hidden until the row is hovered, like the reference's display:none
    // button — which also empties its accessible name, so find it by text.
    const seeIssues = screen.getByText('overview.milestoneSeeIssues');
    expect(seeIssues.tagName).toBe('A');
    expect(seeIssues).not.toBeVisible();
    expect(seeIssues).toHaveAttribute('href', '/project/apollo/tasks?projectMilestoneId=ms_1');
    // Mirrors the reference's tabindex=-1; keyboard users reach the same list
    // from the overview card's always-visible progress link.
    expect(seeIssues).toHaveAttribute('tabindex', '-1');
  });

  it('links each overview milestone to its filtered issues, next to the untouched icon anchor', () => {
    render(
      <ProjectDashboard
        detail={{ ...detail, milestones: [milestoneWithProgress] }}
        projectId={'prj_1'}
      />,
    );

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#milestone-ms_1', '/project/apollo/tasks?projectMilestoneId=ms_1']);
  });

  it('renders no readout, and no progress link, when progress could not be computed', () => {
    const unknown = { ...milestone, progress: null };
    render(<ProjectDashboard detail={{ ...detail, milestones: [unknown] }} projectId={'prj_1'} />);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#milestone-ms_1',
    ]);

    cleanup();
    mocks.textProps = [];
    mocks.milestones = [unknown];
    render(<ProjectSidePanel projectId="apollo" />);
    expect(screen.queryByText('overview.milestoneProgressOf')).not.toBeInTheDocument();
  });

  it('gives each milestone name the typography the reference measured', () => {
    render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);
    const overviewName = mocks.textProps.find((props) => props.children === milestone.name) ?? {};

    cleanup();
    mocks.textProps = [];

    mocks.milestones = [milestone];
    render(<ProjectSidePanel projectId="apollo" />);
    const railName = mocks.textProps.find((props) => props.children === milestone.name) ?? {};

    // Measured on the reference: 15px/450 in the overview card, 12px/450 in the
    // rail. Reading the name, not editing it — the reference's overview name is
    // a ProseMirror editor, and we deliberately do not copy that.
    expect(overviewName).toMatchObject({ fontSize: 15, weight: 450 });
    expect(railName).toMatchObject({ fontSize: 12, weight: 450 });
  });

  it('draws the milestone diamond with one shared paint on both surfaces', () => {
    render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);
    const overviewIcon = renderedDiamonds()[0] ?? {};

    cleanup();
    mocks.iconProps = [];

    mocks.milestones = [milestone];
    render(<ProjectSidePanel projectId="apollo" />);
    const railIcon = renderedDiamonds()[0] ?? {};

    // The surfaces are compared to **each other** and to the one shared paint
    // object, never to a re-typed hex: either surface moving on its own turns
    // this red, while the paint itself stays free to change in one place.
    expect(railIcon).toMatchObject({ color: overviewIcon.color, fill: overviewIcon.fill });
    for (const icon of [overviewIcon, railIcon]) {
      expect(icon).toMatchObject({ ...MILESTONE_ICON_PAINT, size: MILESTONE_ICON_SIZE });
    }

    // Two tones, not one flat colour: the reference fills the diamond a step
    // darker (`#505ec4`) than the outline it draws it in (`#5e6ad2`). Read off
    // the rendered props rather than the constant, so a call site that passes
    // the stroke colour as its own fill is caught too — that flat glyph is what
    // shipped, and comparing the two surfaces alone cannot see it.
    for (const icon of [overviewIcon, railIcon]) {
      expect(icon.fill).not.toBe(icon.color);
    }
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

describe('project overview inline properties', () => {
  it('opens the main status menu and refreshes its label after a successful status write', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.updateStatus).mockImplementation(async (_id, status) => {
      mocks.serverStatus = status;
      return { data: { status } } as Awaited<ReturnType<typeof projectService.updateStatus>>;
    });
    render(<ProjectWorkspace />);

    await user.click(screen.getByRole('button', { name: 'properties.status' }));
    expect(screen.getByRole('menuitem', { name: 'status.planned' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'status.planned' }));
    await waitFor(() => {
      expect(mocks.detailMutate).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'properties.status' })).toHaveTextContent(
        'planned',
      );
    });
    expect(projectService.updateStatus).toHaveBeenCalledWith('prj_1', 'planned');
  });

  it('offers Canceled on writable projects and saves that transition', async () => {
    const user = userEvent.setup();
    vi.mocked(projectService.updateStatus).mockImplementation(async (_id, status) => {
      mocks.serverStatus = status;
      return { data: { status } } as Awaited<ReturnType<typeof projectService.updateStatus>>;
    });
    render(<ProjectWorkspace />);

    await user.click(screen.getByRole('button', { name: 'properties.status' }));
    await user.click(screen.getByRole('menuitem', { name: 'status.canceled' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'properties.status' })).toHaveTextContent(
        'canceled',
      ),
    );
    expect(projectService.updateStatus).toHaveBeenCalledWith('prj_1', 'canceled');
  });

  it('offers only Archived after completion and locks an archived completed project', async () => {
    const user = userEvent.setup();
    mocks.projectStatus = 'completed';
    const view = render(<ProjectWorkspace />);

    await user.click(screen.getByRole('button', { name: 'properties.status' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'status.archived',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'status.canceled' })).not.toBeInTheDocument();

    mocks.projectStatus = 'archived';
    mocks.completedReviewId = 'review_1';
    mocks.projectVersion += 1;
    for (const listener of mocks.projectListeners) listener();
    view.rerender(<ProjectWorkspace />);
    expect(screen.getByRole('button', { name: 'properties.status' })).toBeDisabled();
  });

  it('renders both date glyphs in the main property row', () => {
    render(<ProjectWorkspace />);
    expect(mocks.iconProps.some((props) => props.icon === CalendarDaysIcon)).toBe(true);
    expect(mocks.iconProps.some((props) => props.icon === CalendarIcon)).toBe(true);
  });
});

// Linear's rail Properties card has exactly eight rows — Status, Priority,
// Lead, Members, Dates, Teams, Slack, Labels — and no `Milestones` row:
// milestones live in their own card below it. An earlier pass added the row
// anyway, and nothing could see it: `require-linear-tokens` only checks size
// ceilings, so a row Linear does not have passes that gate by construction.
// This asserts the row *set*, by membership rather than by count, so any row
// added or dropped has to be acknowledged here.
describe('project properties row set', () => {
  const renderedRowLabels = (value: ProjectDetail) => {
    const { container } = render(<ProjectPropertiesCard detail={value} projectId={'prj_1'} />);
    const card = container.firstElementChild;
    if (!card) throw new Error('ProjectPropertiesCard rendered no card');
    return new Set([...card.children].map((row) => row.firstElementChild?.textContent ?? ''));
  };

  it('spaces the Properties rows at the 8px the reference measured', () => {
    const { container } = render(<ProjectPropertiesCard detail={detail} projectId={'prj_1'} />);
    const card = container.firstElementChild as Element;

    // 8px between 28px rows is what makes the row pitch 36 on the reference;
    // this card used to run at 6px, i.e. a 34 pitch. Read as the *prop* the
    // card was rendered with, never off the element: `gap` reaches the DOM only
    // because the `Flexbox` stub spreads props onto a `<div>`, and the real
    // component renders it as a class. The 90px label column and the 0
    // label→value gap on the same rows are layout CSS, which jsdom cannot
    // resolve (it returns `''` for `width`, having no cascade for the injected
    // sheet) — those are measured in the running app instead.
    expect(mocks.flexboxProps.get(card)?.gap).toBe(8);
  });

  it('renders Linear’s row set and no Milestones row', () => {
    expect(
      renderedRowLabels({
        ...detail,
        milestones: [milestone],
        teams: [{ id: 'team_1', name: 'orvilo' }] as NonNullable<ProjectDetail['teams']>,
      }),
    ).toEqual(
      new Set([
        'properties.status',
        'properties.priority',
        'properties.lead',
        'properties.members',
        'properties.dates',
        // The one label whose call site carries an inline default, so this is
        // the string the row renders rather than its key in this i18n stub.
        'Teams',
        'properties.labels',
      ]),
    );
  });
});

// The row's geometry, measured on the reference: a 90px label column with no
// gap after it, 8px between rows, and a Dates row that stays on one line.
// Only the parts a DOM can hold are asserted here — jsdom computes no layout,
// so the pixel values themselves are CDP work (`PARITY-TABLE.md`).
describe('project properties row geometry', () => {
  const LABELS = [
    'properties.status',
    'properties.priority',
    'properties.lead',
    'properties.members',
    'properties.dates',
    'Teams',
    'properties.labels',
  ];

  const dated = {
    ...detail,
    project: { ...detail.project, startDate: '2026-09-21', targetDate: '2027-02-01' },
  } as ProjectDetail;

  /** Every date control the page rendered, by class list. */
  const pickerClasses = () =>
    [...document.querySelectorAll('.ant-picker')].map((el) => el.className);

  it('gives every row label the same 12px, including Status', () => {
    render(<ProjectPropertiesCard detail={dated} projectId={'prj_1'} />);
    for (const label of LABELS) {
      expect(mocks.textProps.find((props) => props.children === label)).toMatchObject({
        fontSize: 12,
      });
    }
  });

  it('keeps the Dates row on one line instead of the fixed 120px boxes', () => {
    render(<ProjectPropertiesCard detail={dated} projectId={'prj_1'} />);
    const inCard = pickerClasses();
    expect(inCard).toHaveLength(2);
    // The row cannot wrap any more (this reads the prop the component passes;
    // jsdom cannot measure the 60px → 28px row height it buys).
    expect(screen.getByText('properties.dates').parentElement?.children[1]).not.toHaveAttribute(
      'wrap',
    );

    cleanup();

    // The standalone usage in the overview's chip row keeps its fixed box, so
    // the difference is exactly that class — and it must be absent in the card.
    render(<ProjectDateField kind={'startDate'} project={dated.project} />);
    const standalone = pickerClasses()[0] ?? '';
    const cardTokens = new Set((inCard[0] ?? '').split(/\s+/));
    const onlyOnStandalone = standalone.split(/\s+/).filter((token) => !cardTokens.has(token));
    expect(onlyOnStandalone).toHaveLength(1);
  });
});

// Unmeasured project states keep one shared glyph. The details side had grown a
// private status → icon map — seven of its eight entries disagreed with the
// shared spec — so `/projects` and a project's own pages drew different icons
// without reference evidence. Active is the deliberate exception below: the
// live rail exposes its complete In Progress SVG, so that geometry is asserted
// directly instead of generalized to other surfaces.
describe('project status glyph', () => {
  const STATUSES = [
    'archived',
    'backlog',
    'canceled',
    'completed',
    'paused',
    'planned',
    'reviewing',
  ] as const;

  /** The icon element the rail Properties card puts in its status control. */
  const railIcon = (status: ProjectStatus) => {
    render(
      <ProjectPropertiesCard
        detail={{ ...detail, project: { ...detail.project, status } }}
        projectId={'prj_1'}
      />,
    );
    const visual = PROJECT_STATUS_VISUALS[resolveProjectStatus(status)];
    // Identified by the colour the control paints itself, so this reads the
    // glyph of the status under test and not whichever icon came first.
    const control = mocks.tagProps.find((props) => props.color === visual.color);
    return control?.icon as ReactElement<{ children?: unknown; icon?: unknown }> | undefined;
  };

  /** The glyph the `/projects` list row draws in its Status column. */
  const listGlyph = (status: string) => {
    mocks.projectList = [{ ...detail.project, status } as ProjectListItem];
    render(<ProjectListPage />);
    const visual = PROJECT_STATUS_VISUALS[resolveProjectStatus(status)];
    return mocks.iconProps.find((props) => props.color === visual.color)?.icon;
  };

  it.each(STATUSES)('draws %s the same way on the project list and in the rail', (status) => {
    const rail = railIcon(status)?.props.icon;
    expect(rail).toBeDefined();

    cleanup();
    mocks.iconProps = [];
    mocks.tagProps = [];

    expect(listGlyph(status)).toBe(rail);
  });

  it('draws the measured 16px filled In Progress glyph in the rail', () => {
    const icon = railIcon('active');
    expect(icon?.type).toBe(ProjectActiveStatusIcon);
    expect(icon?.props).toMatchObject({ color: cssVar.colorWarning });
    render(icon!);
    const svg = document.querySelector('svg[viewBox="-1 -1 16 16"]');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg?.querySelector('path')).toHaveAttribute(
      'd',
      'M2.95778 3.02069L5.70777 1.36023C6.50244 0.88041 7.49756 0.88041 8.29223 1.36024L11.0422 3.02074C11.7918 3.47336 12.25 4.2852 12.25 5.16086V8.84803C12.25 9.7251 11.7904 10.5381 11.0388 10.9902L8.29114 12.6433C7.49693 13.1211 6.50355 13.1203 5.71011 12.6412L2.95775 10.9792C2.20815 10.5266 1.75 9.7148 1.75 8.83911V5.16082C1.75 4.28516 2.20816 3.47332 2.95778 3.02069Z',
    );
  });
});

describe('project list indicators', () => {
  it('shows the priority glyph, missing health update, and issue completion percentage', () => {
    mocks.projectList = [
      {
        ...detail.project,
        avatar: '📦',
        health: null,
        priority: 2,
        progressPercent: 50,
        status: 'active',
        taskCount: 3,
      } as ProjectListItem,
    ];

    render(<ProjectListPage />);

    expect(screen.getByRole('img', { name: 'create.priority.high' })).toBeInTheDocument();
    expect(mocks.iconProps.some((props) => props.icon === BoxIcon)).toBe(true);
    expect(screen.getByText('list.health.noUpdates')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('status.active')).toBeInTheDocument();
    expect(document.querySelector('svg[viewBox="-1 -1 16 16"]')).toBeInTheDocument();
    expect(screen.getByText('Target date')).toBeInTheDocument();
    expect(screen.queryByText('High')).not.toBeInTheDocument();
  });
});

// One muted tone for every section label. The candidate had grown several
// greys for that single semantic, and wrong in both directions: `#999999` on
// the overview's `Properties` / `Resources` headings (the placeholder tone) and
// body ink `#080808` on the `Description` label and the `Milestones` heading.
// Asserted through the shared constant, so a surface that picks a private grey
// again turns this red — and against the token, so swapping the constant for
// some other grey has to be deliberate too.
describe('project section label tone', () => {
  const labelProps = (key: string) => mocks.textProps.find((props) => props.children === key) ?? {};

  it('pins the tone to the one shared token', () => {
    expect(MUTED_LABEL_COLOR).toBe(cssVar.colorTextSecondary);
  });

  it('dims the description disclosure instead of leaving it at body colour', () => {
    render(<ProjectDescription description="Initial" projectId="prj_1" />);
    expect(labelProps('overview.descriptionLabel')).toMatchObject({ color: MUTED_LABEL_COLOR });
    expect(labelProps('overview.descriptionLabel')).not.toHaveProperty('type');
  });

  // These two call sites pass an inline English default, so the rendered string
  // is that default rather than the key, in this i18n stub and in en-US alike.
  it.each(['Properties', 'Resources'])('dims the overview %s heading', (rendered) => {
    render(<ProjectWorkspace />);
    expect(labelProps(rendered)).toMatchObject({ color: MUTED_LABEL_COLOR });
    expect(labelProps(rendered)).not.toHaveProperty('type');
  });

  it('brings the milestones heading down from body-title scale', () => {
    render(<ProjectDashboard detail={withMilestone} projectId={'prj_1'} />);
    expect(labelProps('overview.milestones')).toMatchObject({
      color: MUTED_LABEL_COLOR,
      fontSize: 13,
      weight: 500,
    });
  });

  it('dims the rail section titles the same way as the overview ones', () => {
    render(<ProjectSidePanel projectId="apollo" />);
    expect(labelProps('overview.propertiesLabel')).toMatchObject({ color: MUTED_LABEL_COLOR });
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
    expect(screen.getByRole('combobox', { name: 'properties.priority' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'properties.members' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'properties.labels' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'create.startDate' })).toHaveValue('Sep 2026');
    expect(screen.getByRole('textbox', { name: 'create.targetDate' })).toHaveValue('2027 Q1');
    expect(screen.getByText('UI parity')).toBeInTheDocument();
    expect(screen.getByText('orvilo')).toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '@/store/project';

import ProjectWorkspace from './index';
import ProjectDashboard from './ProjectDashboard';
import ProjectPropertiesCard from './ProjectPropertiesCard';

const mocks = vi.hoisted(() => ({
  goalSWR: { data: undefined as unknown, error: undefined, isLoading: false, mutate: vi.fn() },
  goals: [] as { goal: { id: string; status: string; title: string } }[],
  listByWorkspace: vi.fn(),
  navigate: vi.fn(),
  projectMembersQuery: vi.fn(() => ({
    data: [],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  })),
  projectResolved: true,
  requestedKeys: [] as unknown[],
  workSWR: {
    data: undefined as { items: unknown[] } | undefined,
    error: undefined as unknown,
    isLoading: false,
    mutate: vi.fn(),
  },
}));

// Only the artifacts card is under test; the shell components are stand-ins so
// the assertions read the data the card was built from, not markup details.
vi.mock('@lobehub/ui', () => ({
  Block: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Center: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Empty: ({ title }: { title?: ReactNode }) => <div>{title}</div>,
  Flexbox: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Icon: () => null,
  TextArea: () => <textarea />,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Tag: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock('antd', () => ({ Progress: () => null }));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws_1',
}));

vi.mock('@/components/AsyncError', () => ({ default: () => null }));
vi.mock('@/components/Skeleton', () => ({ ArticleSkeleton: () => null }));
vi.mock('@/features/AgentTasks/shared/taskDetailPath', () => ({
  taskDetailPath: (id: string) => `/tasks/${id}`,
}));
vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({ title, description }: { title?: ReactNode; description?: ReactNode }) => (
    <div>
      {title}
      {description && <span>{description}</span>}
    </div>
  ),
}));

vi.mock('@/features/Projects/Layout/navigation', () => ({
  getProjectGoalsPath: () => '/project/prj_1/goals',
  getProjectTasksPath: () => '/project/prj_1/tasks',
}));

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

// Standing in for SWR: recording the key is the point of the test (the card
// must be cached per project), and invoking the fetcher makes the query the card
// actually issues observable. Only the Works fetcher runs — the dashboard's
// other cards resolve against real services, which must not hit the network.
vi.mock('@/libs/swr', () => ({
  useClientDataSWR: (key: unknown, fetcher: () => unknown) => {
    mocks.requestedKeys.push(key);
    if (Array.isArray(key) && key[0] === 'work:workspace') void fetcher();
    return mocks.workSWR;
  },
}));

vi.mock('@/services/work', () => ({
  workService: { listByWorkspace: mocks.listByWorkspace },
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
} as unknown as ProjectDetail;

beforeEach(() => {
  mocks.projectResolved = true;
  mocks.requestedKeys = [];
  mocks.projectMembersQuery.mockClear();
  mocks.navigate.mockClear();
  mocks.goals = [];
  mocks.listByWorkspace.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  mocks.workSWR = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
});

afterEach(cleanup);

const artifactQuery = () =>
  mocks.listByWorkspace.mock.calls.find(([params]) => params?.limit === 4)?.[0];

const renderCharts = () => render(<ProjectDashboard detail={detail} projectId={'prj_1'} />);

describe('project dashboard artifacts', () => {
  // Regression: the card asked for Works by the project's COORDINATOR agent, so a
  // project whose Works were produced by other agents reported none — even though
  // `project_works` binds them. It must ask for the project's Works instead.
  it('asks for the Works bound to the project, not the coordinator agent', () => {
    renderCharts();

    expect(artifactQuery()).toEqual({ limit: 4, projectId: 'prj_1' });
    expect(artifactQuery()).not.toHaveProperty('originAgentId');
  });

  it('caches the card per project rather than per coordinator', () => {
    renderCharts();

    expect(mocks.requestedKeys).toContainEqual([
      'work:workspace',
      'ws_1',
      'project:prj_1',
      null,
      null,
    ]);
  });

  it('renders the Works the project has', () => {
    mocks.workSWR.data = { items: [{ id: 'work_1' }, { id: 'work_2' }] };

    renderCharts();

    expect(screen.getByText('overview.latestWorks')).toBeInTheDocument();
    expect(document.querySelector('[data-work="work_1"]')).not.toBeNull();
    expect(document.querySelector('[data-work="work_2"]')).not.toBeNull();
    expect(screen.queryByText('overview.worksEmptyTitle')).not.toBeInTheDocument();
  });

  it('shows the empty state only when the project genuinely has no Works', () => {
    renderCharts();

    expect(screen.getByText('overview.worksEmptyTitle')).toBeInTheDocument();
  });
});

describe('project dashboard milestones', () => {
  it('does not label agent goals as project milestones', () => {
    mocks.goals = [
      { goal: { id: 'goal_1', status: 'active', title: 'Ship parity' } },
      { goal: { id: 'goal_2', status: 'achieved', title: 'Draft spec' } },
    ];

    renderCharts();

    expect(screen.getByText('sections.goals')).toBeInTheDocument();
    expect(screen.getByText('Ship parity')).toBeInTheDocument();
    expect(screen.getByText('Draft spec')).toBeInTheDocument();
  });

  it('renders project milestones separately from agent goals', () => {
    mocks.goals = [{ goal: { id: 'goal_1', status: 'active', title: 'Ship parity' } }];

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
    expect(screen.getByText('Ship parity')).toBeInTheDocument();
    expect(screen.queryByText('overview.milestonesEmpty')).not.toBeInTheDocument();
  });

  it('keeps the orchestration policy reachable inside the overview', () => {
    renderCharts();

    expect(screen.getByText('orchestration.title')).toBeInTheDocument();
  });
});

describe('project dashboard task previews', () => {
  it('does not repeat a task title as its description', () => {
    render(
      <ProjectDashboard
        projectId={'prj_1'}
        detail={{
          ...detail,
          tasks: [
            {
              id: 'task_1',
              name: 'Ship navigation',
              instruction: 'Ship navigation',
              status: 'backlog',
            },
          ] as ProjectDetail['tasks'],
        }}
      />,
    );
    expect(screen.getAllByText('Ship navigation')).toHaveLength(1);
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
  it('renders priority, precision dates, labels, and clickable dependencies', () => {
    render(
      <ProjectPropertiesCard
        goalProgress={50}
        projectId={'prj_1'}
        detail={{
          ...detail,
          dependencies: [
            {
              project: { id: 'prj_dependency', name: 'Blocked release', slug: 'blocked-release' },
              type: 'blockedBy',
            },
          ] as NonNullable<ProjectDetail['dependencies']>,
          labels: [{ id: 'label_ui', name: 'UI parity' }] as NonNullable<ProjectDetail['labels']>,
          project: {
            ...detail.project,
            priority: 2,
            startDate: '2026-09-21',
            startDatePrecision: 'month',
            targetDate: '2027-02-01',
            targetDatePrecision: 'quarter',
          },
        }}
      />,
    );

    expect(screen.getByText('create.priority.high')).toBeInTheDocument();
    expect(screen.getByText('Sep 2026 → 2027 Q1')).toBeInTheDocument();
    expect(screen.getByText('UI parity')).toBeInTheDocument();

    fireEvent.click(screen.getByText('create.dependencies.blockedBy · Blocked release'));
    expect(mocks.navigate).toHaveBeenCalledWith('/project/blocked-release');
  });
});

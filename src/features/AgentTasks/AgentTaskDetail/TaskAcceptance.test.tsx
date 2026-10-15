/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { useUserStore as UserStoreHook } from '@/store/user';

import { PendingAcceptanceCheckList } from './PendingAcceptanceCheckList';
import TaskAcceptance from './TaskAcceptance';
import type { TaskDetailScope } from './TaskDetailScope';
import type TaskVerifyConfig from './TaskVerifyConfig';

// The section links out to the acceptance report, so it needs router context.
const render = (ui: ReactNode) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const mocks = vi.hoisted(() => ({
  acceptanceSubject: null as null | { id: string },
  bundle: undefined as
    | undefined
    | {
        acceptance: { id: string; requirement: string };
        checks: Array<{
          category: string;
          id: string;
          seq: number;
          title: string;
        }>;
        isOwner: boolean;
      },
  currentPortalView: null as null | string,
  openDeleteConfirm: vi.fn(),
  deleteAcceptance: vi.fn(),
  mutateBundle: vi.fn(),
  mutateSubject: vi.fn(),
  navigate: vi.fn(),
  openAcceptance: vi.fn(),
  openAcceptanceCheck: vi.fn(),
  subjectArgs: [] as unknown[],
  taskDetailOverrides: {} as Record<string, unknown>,
  toggleTaskAgentPanel: vi.fn(),
  updateVerifyConfig: vi.fn(),
}));

// Real ActionIcon only surfaces its title via a hover Tooltip; the
// assertions click the title text directly.
vi.mock('./TaskReviewerProperty', () => ({ default: () => <div>Reviewer Agent</div> }));

vi.mock('@/components/ActionIcon', () => ({
  default: ({ onClick, title }: { onClick?: () => void; title?: string }) => (
    <button type="button" onClick={onClick}>
      {title}
    </button>
  ),
}));

vi.mock('@/features/Acceptance/AcceptanceDeleteConfirm', () => ({
  openAcceptanceDeleteConfirm: (opts: unknown) => mocks.openDeleteConfirm(opts),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: { useApp: () => ({ message: { error: vi.fn() } }) },
}));

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/features/Acceptance/hooks', () => ({ useRubrics: () => ({ data: [] }) }));

vi.mock('@/features/Acceptance', async () => ({
  // The real row/list primitives: the assertions cover the shared grammar.
  ...(await vi.importActual('@/features/Acceptance/CriterionList')),
  CheckRow: ({ check }: { check: { title: string } }) => (
    <div data-testid="acceptance-check-detail">detail: {check.title}</div>
  ),
  checkDisplayTitle: (title: string) => title,
  checkHeadMeta: () => ({ color: 'green', icon: () => null }),
  shouldGroupChecks: (checkCount: number) => checkCount > 10,
  groupChecks: (checks: Array<{ category: string }>) =>
    [...new Set(checks.map((check) => check.category))].map((category) => ({
      checks: checks.filter((check) => check.category === category),
      key: `category:${category}`,
      label: category,
    })),
  useAcceptanceBundle: () => ({
    data: fixture.active ? undefined : mocks.bundle,
    error: undefined,
    isLoading: fixture.active && fixture.busyPath === 'bundle',
    mutate: fixture.active ? fixture.mutateBundle : mocks.mutateBundle,
  }),
  useAcceptanceBySubject: (...args: unknown[]) => {
    mocks.subjectArgs = args;
    return {
      data: fixture.active
        ? fixture.busyPath === 'bundle'
          ? { id: 'motion-acceptance' }
          : undefined
        : mocks.acceptanceSubject,
      error: undefined,
      isLoading: fixture.active && fixture.busyPath === 'subject',
      mutate: fixture.active ? fixture.mutateSubject : mocks.mutateSubject,
    };
  },
}));

// The result panel mounts the real Acceptance atoms; the assertions only care
// that the right atoms land in the right scope, not their internals.
vi.mock('@/features/Acceptance/Viewer/AcceptanceScope', () => ({
  AcceptanceBundleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
  AcceptanceScope: ({
    acceptanceId,
    children,
    embedded,
  }: {
    acceptanceId: string;
    children: ReactNode;
    embedded?: boolean;
  }) => (
    <div
      data-acceptance-id={acceptanceId}
      data-embedded={embedded ? '' : undefined}
      data-testid="acceptance-scope"
    >
      {children}
    </div>
  ),
}));

vi.mock('@/features/Acceptance/Viewer/Checks/AcceptanceCheckInventory', () => ({
  default: ({ toolbar }: { toolbar?: ReactNode }) => (
    <div data-testid="acceptance-check-inventory">{toolbar}</div>
  ),
}));

vi.mock('@/features/Acceptance/Viewer/Review/AcceptanceDecision', () => ({
  default: () => <div data-testid="acceptance-decision" />,
}));

vi.mock('@/services/verify', () => ({
  verifyService: {
    deleteAcceptance: (id: string, purge?: boolean) => mocks.deleteAcceptance(id, purge),
    reviewChecks: vi.fn(),
    generateCriteria: (...args: unknown[]) => fixture.generateCriteria(...args),
  },
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openAcceptance: mocks.openAcceptance,
      openAcceptanceCheck: mocks.openAcceptanceCheck,
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  chatPortalSelectors: { currentViewType: () => mocks.currentPortalView },
}));

vi.mock('@/store/chat/slices/portal/initialState', () => ({
  PortalViewType: { TaskDetail: 'taskDetail' },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ toggleTaskAgentPanel: mocks.toggleTaskAgentPanel }),
}));

vi.mock('@/store/task', () => {
  const useTaskStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeTaskId: 'T-231',
      taskDetailMap: {
        'T-231': { id: 'task-database-231', identifier: 'T-231', ...mocks.taskDetailOverrides },
        'T-motion': {
          id: 'motion-db',
          name: 'A motion regression goal',
          reviewerAgentId: 'reviewer-1',
        },
      },
    });
  useTaskStore.getState = () => ({
    updateVerifyConfig: mocks.updateVerifyConfig,
  });
  return { useTaskStore };
});

vi.mock('../shared/AccordionArrowIcon', () => ({ default: () => <span>arrow</span> }));
vi.mock('./TaskVerifyConfig', () => ({
  default: () => <div data-testid="task-acceptance-criteria">criteria</div>,
}));

describe('TaskAcceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acceptanceSubject = null;
    mocks.bundle = undefined;
    mocks.currentPortalView = null;
    mocks.taskDetailOverrides = {};
  });

  it('renders nothing for a recurring task — no Verifier config, no acceptance fetch', () => {
    // Recurring tasks never get a verify plan on the server; the whole
    // acceptance section (config editor included) must stay hidden.
    mocks.taskDetailOverrides = { automationMode: 'schedule' };

    const { container } = render(<TaskAcceptance />);

    expect(screen.queryByTestId('task-acceptance-criteria')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    // The acceptance subject fetch is skipped, not just its rendering.
    expect(mocks.subjectArgs).toEqual(['task', null]);
  });

  it('does not offer a legacy config editor before an archive exists', () => {
    render(<TaskAcceptance />);

    expect(screen.queryByTestId('task-acceptance-criteria')).not.toBeInTheDocument();
    expect(mocks.subjectArgs).toEqual(['task', 'task-database-231']);
  });

  it('keeps a small pending checklist flat with the Acceptance check row grammar', () => {
    const onOpen = vi.fn();

    render(
      <PendingAcceptanceCheckList
        groupLabel={'Ungrouped'}
        items={[
          { id: 'criterion-1', title: 'Word count' },
          { id: 'criterion-2', title: 'Markdown structure' },
        ]}
        onOpen={onOpen}
      />,
    );

    expect(screen.queryByText('Ungrouped')).not.toBeInTheDocument();
    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('C2')).toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Required')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Word count'));
    expect(onOpen).toHaveBeenCalledWith({ id: 'criterion-1', title: 'Word count' });
  });

  it('shows the pending checklist group only after it exceeds ten checks', () => {
    render(
      <PendingAcceptanceCheckList
        groupLabel={'Ungrouped'}
        items={Array.from({ length: 11 }, (_, index) => ({
          id: `criterion-${index + 1}`,
          title: `Check ${index + 1}`,
        }))}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    expect(screen.getByText('Check 11')).toBeInTheDocument();
  });

  it('opens the selected check and expands its Acceptance panel from Task detail', () => {
    mocks.currentPortalView = 'taskDetail';
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [
        { category: 'Setup', id: 'c1', seq: 1, title: 'Create task' },
        { category: 'Result', id: 'c2', seq: 2, title: 'Show result' },
      ],
      isOwner: true,
    };

    render(<TaskAcceptance />);

    expect(screen.queryByTestId('task-acceptance-criteria')).not.toBeInTheDocument();
    expect(screen.queryByText('Setup')).not.toBeInTheDocument();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
    expect(screen.queryByText('taskDetail.acceptance.collapseAll')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Create task'));
    expect(mocks.toggleTaskAgentPanel).toHaveBeenCalledWith(true);
    expect(mocks.openAcceptanceCheck).toHaveBeenCalledWith('acceptance-1', 'c1');
  });

  it('opens the acceptance report in the panel rather than navigating away', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [{ category: 'Setup', id: 'c1', seq: 1, title: 'Create task' }],
      isOwner: true,
    };

    render(<TaskAcceptance />);

    fireEvent.click(screen.getByText('taskDetail.acceptance.openReport'));
    expect(mocks.toggleTaskAgentPanel).toHaveBeenCalledWith(true);
    expect(mocks.openAcceptance).toHaveBeenCalledWith('acceptance-1');
  });

  it('mounts the archive checklist without a decision bar in the task result panel', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [{ category: 'Setup', id: 'c1', seq: 1, title: 'Create task' }],
      isOwner: true,
    };

    render(<TaskAcceptance variant={'result'} />);

    const scope = screen.getByTestId('acceptance-scope');
    expect(scope).toHaveAttribute('data-acceptance-id', 'acceptance-1');
    expect(scope).toHaveAttribute('data-embedded');
    expect(screen.getByTestId('acceptance-check-inventory')).toBeInTheDocument();
    expect(screen.queryByTestId('acceptance-decision')).not.toBeInTheDocument();
    // No collapsible 交付验收 section header — the inventory brings its own.
    expect(screen.queryByText('taskDetail.acceptance.title')).not.toBeInTheDocument();
  });

  it('keeps the report link reachable from the inventory toolbar in the result panel', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [{ category: 'Setup', id: 'c1', seq: 1, title: 'Create task' }],
      isOwner: true,
    };

    render(<TaskAcceptance variant={'result'} />);

    fireEvent.click(screen.getByText('taskDetail.acceptance.openReport'));
    expect(mocks.toggleTaskAgentPanel).toHaveBeenCalledWith(true);
    expect(mocks.openAcceptance).toHaveBeenCalledWith('acceptance-1');
  });

  it('falls back to the configured criteria in the result panel before an acceptance exists', () => {
    render(<TaskAcceptance variant={'result'} />);

    expect(screen.queryByTestId('task-acceptance-criteria')).not.toBeInTheDocument();
    expect(screen.queryByTestId('acceptance-scope')).not.toBeInTheDocument();
  });

  it('groups a checklist with more than 10 checks', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: Array.from({ length: 11 }, (_, index) => ({
        category: index < 6 ? 'Setup' : 'Result',
        id: `c${index + 1}`,
        seq: index + 1,
        title: `Check ${index + 1}`,
      })),
      isOwner: true,
    };

    render(<TaskAcceptance />);

    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('taskDetail.acceptance.collapseAll')).toBeInTheDocument();
    expect(screen.getByText('Check 11')).toBeInTheDocument();
  });

  it('keeps owner archive rows readable without deletion or config controls', async () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [{ category: 'Setup', id: 'c1', seq: 1, title: 'Create task' }],
      isOwner: true,
    };

    render(<TaskAcceptance />);

    expect(screen.queryByText('taskDetail.acceptance.remove')).not.toBeInTheDocument();
    expect(screen.getByText('Create task')).toBeInTheDocument();
    expect(mocks.openDeleteConfirm).not.toHaveBeenCalled();
    expect(mocks.updateVerifyConfig).not.toHaveBeenCalled();
    expect(mocks.deleteAcceptance).not.toHaveBeenCalled();
  });

  it('hides the remove button when the viewer does not own the acceptance', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [{ category: 'Setup', id: 'c1', seq: 1, title: 'Create task' }],
      isOwner: false,
    };

    render(<TaskAcceptance />);

    expect(screen.getByText('Create task')).toBeInTheDocument();
    expect(screen.queryByText('taskDetail.acceptance.remove')).not.toBeInTheDocument();
  });

  it('keeps the Acceptance cross-round union visible in Task detail', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: [
        { category: 'Current', id: 'c1', seq: 1, title: 'Current check' },
        { category: 'Historical', id: 'old', seq: 2, title: 'Removed check' },
      ],
      isOwner: true,
    };

    render(<TaskAcceptance />);

    expect(screen.getByText('Current check')).toBeInTheDocument();
    expect(screen.getByText('Removed check')).toBeInTheDocument();
  });

  it('groups a checklist only after it exceeds ten checks', () => {
    mocks.acceptanceSubject = { id: 'acceptance-1' };
    mocks.bundle = {
      acceptance: { id: 'acceptance-1', requirement: 'Everything is verifiable.' },
      checks: Array.from({ length: 11 }, (_, index) => ({
        category: index < 6 ? 'Setup' : 'Result',
        id: `c${index + 1}`,
        seq: index + 1,
        title: `Check ${index + 1}`,
      })),
      isOwner: true,
    };

    render(<TaskAcceptance />);

    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('taskDetail.acceptance.collapseAll')).toBeInTheDocument();
    expect(screen.getByText('Check 11')).toBeInTheDocument();
  });
});

// Existing TaskAcceptance tests above keep their original fixtures and cases.
// The motion cases use the same module graph and switch only the data fixtures.
let MotionTaskAcceptance: typeof TaskAcceptance;
let MotionTaskVerifyConfig: typeof TaskVerifyConfig;
let MotionTaskDetailScope: typeof TaskDetailScope;
let useMotionUserStore: typeof UserStoreHook;
let originalUserSettings: ReturnType<typeof UserStoreHook.getState>['settings'];

const fixture = vi.hoisted(() => {
  const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  const mediaLists = new Map<string, MediaQueryList>();
  let reduced = false;
  const matchMedia = (query: string): MediaQueryList => {
    if (!mediaLists.has(query)) {
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      const target = new EventTarget();
      const list = Object.assign(target, {
        matches: false,
        media: query,
        onchange: null,
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
        notify: () => {
          const event = Object.assign(new Event('change'), {
            matches: list.matches,
            media: query,
          }) as MediaQueryListEvent;
          listeners.forEach((listener) => listener(event));
          target.dispatchEvent(event);
        },
      });
      Object.defineProperty(list, 'matches', {
        get: () => query === '(prefers-reduced-motion: reduce)' && reduced,
      });
      mediaLists.set(query, list as unknown as MediaQueryList);
    }
    return mediaLists.get(query)!;
  };
  // matchmediaquery captures window.matchMedia when its external module loads.
  // Install the public native boundary before any component import evaluates.
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  return {
    active: false,
    originalMatchMedia,
    busyPath: 'subject' as 'subject' | 'bundle',
    generateCriteria: vi.fn(),
    mutateBundle: vi.fn(),
    mutateSubject: vi.fn(),
    setReduced: (next: boolean) => {
      reduced = next;
      mediaLists.forEach((list) => (list as MediaQueryList & { notify: () => void }).notify());
    },
  };
});

const modes = [
  { animationMode: 'agile', reduced: false, animated: true },
  { animationMode: 'agile', reduced: true, animated: false },
  { animationMode: 'disabled', reduced: false, animated: false },
  { animationMode: 'disabled', reduced: true, animated: false },
] as const;
const paths = ['subject', 'bundle', 'generation'] as const;
type BusyPath = (typeof paths)[number];

const setMode = (animationMode: 'agile' | 'disabled') =>
  useMotionUserStore.setState((state) => ({
    settings: { ...state.settings, general: { ...state.settings.general, animationMode } },
  }));

const mountBusy = async (path: BusyPath) => {
  fixture.busyPath = path === 'bundle' ? 'bundle' : 'subject';
  const result = rtlRender(
    <MotionTaskDetailScope taskId="T-motion">
      {path === 'generation' ? <MotionTaskVerifyConfig /> : <MotionTaskAcceptance />}
    </MotionTaskDetailScope>,
  );
  if (path === 'generation') {
    await userEvent.setup().click(screen.getByText('verifyConfig.empty.title'));
    expect(fixture.generateCriteria).toHaveBeenCalledTimes(1);
    expect(fixture.generateCriteria).toHaveBeenCalledWith(
      expect.objectContaining({ goal: 'A motion regression goal' }),
    );
    expect(screen.getByText('verifyConfig.generating')).toBeVisible();
  }
  return result;
};

const expectLoading = (container: HTMLElement, animated: boolean, path: BusyPath) => {
  // This is the actual Neural child SVG, with connections and processing unit.
  // No stylesheet source/class matching or fake loading-node replacement.
  const neural = container.querySelector('svg[viewBox="0 0 100 100"]');
  if (animated) {
    expect(neural).not.toBeNull();
    expect(neural!.querySelectorAll('line')).toHaveLength(18);
    expect(neural!.querySelector('rect')).not.toBeNull();
    expect(screen.queryByRole('status', { name: 'loading' })).not.toBeInTheDocument();
  } else {
    expect(neural).toBeNull();
    expect(screen.getByRole('status', { name: 'loading' })).toBeVisible();
  }
  if (path === 'generation') expect(screen.getByText('verifyConfig.generating')).toBeVisible();
  expect(fixture.mutateSubject).not.toHaveBeenCalled();
  expect(fixture.mutateBundle).not.toHaveBeenCalled();
};

describe('Task loading motion respects both live preferences', () => {
  beforeAll(async () => {
    fixture.active = true;
    const [userStore, scope, verification] = await Promise.all([
      import('@/store/user'),
      import('./TaskDetailScope'),
      vi.importActual<{ default: typeof TaskVerifyConfig }>('./TaskVerifyConfig'),
    ]);
    MotionTaskAcceptance = TaskAcceptance;
    MotionTaskVerifyConfig = verification.default;
    MotionTaskDetailScope = scope.TaskDetailScope;
    useMotionUserStore = userStore.useUserStore;
    originalUserSettings = useMotionUserStore.getState().settings;
  });

  afterAll(() => {
    cleanup();
    if (fixture.originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', fixture.originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
    fixture.active = false;
    useMotionUserStore.setState({ settings: originalUserSettings });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fixture.generateCriteria.mockImplementation(() => new Promise(() => {}));
    fixture.setReduced(false);
    setMode('agile');
  });
  afterEach(() => cleanup());

  describe.each(paths)('%s busy path', (path) => {
    it.each(modes)('$animationMode / reduced=$reduced retains the loading state', async (mode) => {
      fixture.setReduced(mode.reduced);
      setMode(mode.animationMode);
      const { container } = await mountBusy(path);
      expectLoading(container, mode.animated, path);
    });

    it('responds to live user and system changes without restarting busy work', async () => {
      const { container } = await mountBusy(path);
      expectLoading(container, true, path);
      act(() => setMode('disabled'));
      expectLoading(container, false, path);
      act(() => setMode('agile'));
      expectLoading(container, true, path);
      act(() => fixture.setReduced(true));
      expectLoading(container, false, path);
      act(() => fixture.setReduced(false));
      expectLoading(container, true, path);
      expect(fixture.generateCriteria).toHaveBeenCalledTimes(path === 'generation' ? 1 : 0);
    });
  });
});

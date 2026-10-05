/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type RealAgentList from '@/features/Home/AgentSelect/AgentList';
import type { ConfiguredAgentRow as RealConfiguredAgentRow } from '@/features/Home/AgentSelect/ConfiguredAgentRow';

import Agent from './index';

const mocks = vi.hoisted(() => ({
  agentMap: {
    agt_current: {
      avatar: 'current-avatar',
      name: 'Current Agent',
    } as Record<string, unknown>,
  } as Record<string, Record<string, unknown>>,
  agentId: 'agt_current',
  chatState: {
    activeTopicId: undefined as string | undefined,
    clearPortalStack: vi.fn(),
    forkTopicAgent: vi.fn(async () => 'tpc_forked'),
    rebindTopicAgent: vi.fn(),
  },
  createModal: vi.fn(),
  fetchAgentList: vi.fn(),
  // Flipped per test: the local-harness probe is an Electron capability, so the
  // picker has to stay out of it on the web build.
  isDesktop: false,
  listSelect: vi.fn(),
  navigate: vi.fn(),
  createAgent: vi.fn(),
  setState: vi.fn(),
  taskAgentId: 'agt_task',
  profile: { data: null as unknown, isLoading: false, error: undefined },
  effectiveConfig: {
    agencyConfig: undefined as unknown,
    isPreferenceLoading: true,
    workspaceScoped: false,
  },
  devices: [] as unknown[],
  updateSystemStatus: vi.fn(),
}));

// Discovery availability belongs to the local transport adapter, not the picker.
vi.mock('@/services/electron/heterogeneousAgent', () => ({
  heterogeneousAgentService: {
    get supportsLocalExecution() {
      return mocks.isDesktop;
    },
  },
}));

vi.mock('@/components/ui/popover', () => ({
  // The real Popover only mounts its content after an open interaction; the
  // assertions read the agent list synchronously.
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  PopoverTrigger: ({ render }: { render: ReactNode }) => (
    <div data-testid="popover-trigger">{render}</div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/Avatar', () => ({
  default: ({ avatar, name }: { avatar?: string; name?: string }) => (
    <span data-avatar={avatar} data-name={name} data-testid="avatar" />
  ),
}));

vi.mock('@/components/Modal', () => ({
  createModal: (options: unknown) => mocks.createModal(options),
  ModalFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useModalContext: () => ({ close: vi.fn() }),
}));

vi.mock('@/features/Home/AgentSelect/AgentList', async (importOriginal) => {
  const { default: AgentList } = await importOriginal<{ default: typeof RealAgentList }>();
  return {
    default: (props: ComponentProps<typeof AgentList>) => {
      mocks.listSelect(props);
      return <AgentList {...props} />;
    },
  };
});

vi.mock('@/features/Home/AgentSelect/useHomeAgentRows', () => ({
  useHomeAgentRows: () => ({
    privateRows: [],
    showPrivateSection: false,
    workspaceRows: [
      { id: 'agt_other', title: 'Other Agent' },
      { id: 'agt_current', title: 'Current Row', pinned: true },
    ],
  }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: { isAgentListInit: boolean }) => unknown) =>
    selector({ isAgentListInit: true }),
}));
vi.mock('@/store/home/selectors', () => ({
  homeAgentListSelectors: {
    isAgentListInit: (s: { isAgentListInit: boolean }) => s.isAgentListInit,
  },
}));

vi.mock('@/features/HomeSidebar/hooks', () => ({
  useCreateMenuItems: () => ({ createAgent: mocks.createAgent }),
}));

vi.mock('@/libs/swr', () => ({ useClientDataSWRWithSync: () => mocks.profile }));
vi.mock('@/hooks/useEffectiveAgencyConfig', () => ({
  useEffectiveAgencyConfig: () => mocks.effectiveConfig,
}));
vi.mock('@/features/DeviceManager/useDeviceList', () => ({
  useDeviceList: () => ({ data: mocks.devices }),
}));
vi.mock('@/store/providerBinding', () => ({
  useFetchProviderBindings: () => ({ data: { data: [] } }),
}));

vi.mock('@/features/Home/AgentSelect/ConfiguredAgentRow', () => ({
  ConfiguredAgentRow: ({
    row,
    active,
    onSelect,
  }: {
    row: { id: string; title: string };
    active: boolean;
    onSelect: (id: string) => void;
  }) => (
    <button aria-pressed={active} onClick={() => onSelect(row.id)}>
      {row.title}
    </button>
  ),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useFetchAgentList', () => ({
  useFetchAgentList: () => {
    mocks.fetchAgentList();
    return { error: undefined, mutate: vi.fn() };
  },
}));

vi.mock('@/hooks/useInitBuiltinAgent', () => ({
  useInitBuiltinAgent: vi.fn(),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: Object.assign((selector: (state: typeof mocks) => unknown) => selector(mocks), {
    getState: () => mocks,
  }),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    getAgentConfigById: (id: string) => (s: typeof mocks) => s.agentMap[id] ?? {},
    getAgentMetaById: (id: string) => (s: typeof mocks) => s.agentMap[id] ?? {},
  },
  builtinAgentSelectors: {
    taskAgentId: (s: typeof mocks) => s.taskAgentId,
  },
}));

vi.mock('@/store/chat', () => ({
  useChatStore: Object.assign(
    (selector: (state: typeof mocks.chatState) => unknown) => selector(mocks.chatState),
    { getState: () => mocks.chatState, setState: mocks.setState },
  ),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: { getState: () => ({ updateSystemStatus: mocks.updateSystemStatus }) },
}));

vi.mock('../../components/SelectorTrigger', () => ({
  default: ({ leading, text }: { leading?: ReactNode; text: string }) => (
    <span data-testid="trigger">
      {leading}
      {text}
    </span>
  ),
}));

vi.mock('../../hooks/useAgentId', () => ({
  useAgentId: () => mocks.agentId,
}));

describe('Agent action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentId = 'agt_current';
    mocks.chatState.activeTopicId = undefined;
    mocks.isDesktop = false;
  });

  it('shows the fixed Orvilo runtime icon and editable display name on the chip', () => {
    const { getByTestId } = render(<Agent />);

    const icon = getByTestId('popover-trigger').querySelector('img');
    expect(icon?.getAttribute('src')).toBe('/app-icons/icon-512x512.png');
    expect(getByTestId('popover-trigger').textContent).toContain('Current Agent');
    expect(mocks.fetchAgentList).toHaveBeenCalledOnce();
    // The dropdown must offer the builtin task agent as a conversation target.
    expect(mocks.listSelect).toHaveBeenCalledWith(
      expect.objectContaining({ activeAgentId: 'agt_current', includeTaskAgent: true }),
    );
  });

  it('lets keyboard users focus and select an agent without moving the conversation', async () => {
    const user = userEvent.setup();
    const { getByRole } = render(<Agent />);

    await user.tab();
    expect(document.activeElement).toBe(getByRole('button', { name: 'Other Agent' }));
    expect(getByRole('button', { name: 'Current Row' }).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Enter}');

    expect(mocks.setState).toHaveBeenCalledWith(
      {
        composerAgentId: 'agt_other',
        composerHeteroEffort: undefined,
        composerModelSelection: undefined,
      },
      false,
      'selectAgent/explicit',
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('retargets the blank composer pick without navigating or confirming', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));

    // The pick routes through the unified `selectAgentForConversation` action.
    expect(mocks.setState).toHaveBeenCalledWith(
      {
        composerAgentId: 'agt_other',
        composerHeteroEffort: undefined,
        composerModelSelection: undefined,
      },
      false,
      'selectAgent/explicit',
    );
    // An explicit pick on a blank composer is a `lastUsedAgentId` write point.
    expect(mocks.updateSystemStatus).toHaveBeenCalledWith({ lastUsedAgentId: 'agt_other' });
    expect(mocks.createModal).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('offers Continue and Fork when a topic is open', () => {
    mocks.chatState.activeTopicId = 'tpc_1';
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));

    const options = mocks.createModal.mock.calls[0][0] as {
      content: { props: { onContinue: () => Promise<void>; onFork: () => Promise<void> } };
      title: string;
    };
    expect(options.title).toBe('agentSwitchChoice.title');
    expect(typeof options.content.props.onContinue).toBe('function');
    expect(typeof options.content.props.onFork).toBe('function');
  });

  it('Continue rebinds the topic in place without navigating', async () => {
    mocks.chatState.activeTopicId = 'tpc_1';
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));

    const { content } = mocks.createModal.mock.calls[0][0] as {
      content: { props: { onContinue: () => Promise<void> } };
    };
    await content.props.onContinue();

    expect(mocks.chatState.rebindTopicAgent).toHaveBeenCalledWith('tpc_1', 'agt_other');
    expect(mocks.chatState.forkTopicAgent).not.toHaveBeenCalled();
    expect(mocks.updateSystemStatus).toHaveBeenCalledWith({ lastUsedAgentId: 'agt_other' });
    // The conversation URL is topic-stable — a handoff never navigates containers.
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('Fork clones the topic under the new agent and lands on the fork', async () => {
    mocks.chatState.activeTopicId = 'tpc_1';
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));

    const { content } = mocks.createModal.mock.calls[0][0] as {
      content: { props: { onFork: () => Promise<void> } };
    };
    await content.props.onFork();

    expect(mocks.chatState.forkTopicAgent).toHaveBeenCalledWith('tpc_1', 'agt_other');
    expect(mocks.chatState.rebindTopicAgent).not.toHaveBeenCalled();
    expect(mocks.updateSystemStatus).toHaveBeenCalledWith({ lastUsedAgentId: 'agt_other' });
    expect(mocks.navigate).toHaveBeenCalledWith('/chat/tpc_forked');
  });

  it('does nothing when the current agent is re-picked', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Current Row'));

    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.createModal).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('opens unified Agent creation without selecting a detected install', () => {
    const { getByText } = render(<Agent />);
    fireEvent.click(getByText('+ newAgent'));
    expect(mocks.createAgent).toHaveBeenCalledOnce();
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('shows Configure after a stale Agent profile settles to null', async () => {
    const { ConfiguredAgentRow } = await vi.importActual<{
      ConfiguredAgentRow: typeof RealConfiguredAgentRow;
    }>('@/features/Home/AgentSelect/ConfiguredAgentRow');
    mocks.profile.data = null;
    mocks.effectiveConfig = {
      agencyConfig: undefined,
      isPreferenceLoading: true,
      workspaceScoped: false,
    };
    const onConfigure = vi.fn();
    const onSelect = vi.fn();
    const { getByText, getByRole } = render(
      <ConfiguredAgentRow
        active={false}
        row={{ id: 'deleted', title: 'Deleted Agent' }}
        onConfigure={onConfigure}
        onSelect={onSelect}
      />,
    );
    expect(getByText('agentPicker.status.configure')).toBeDefined();
    fireEvent.click(getByRole('button', { name: 'agentPicker.configure' }));
    expect(onConfigure).toHaveBeenCalledWith('deleted');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows offline reason and prevents selection of a configured offline Agent', async () => {
    const { ConfiguredAgentRow } = await vi.importActual<{
      ConfiguredAgentRow: typeof RealConfiguredAgentRow;
    }>('@/features/Home/AgentSelect/ConfiguredAgentRow');
    const agencyConfig = {
      executionTarget: 'device',
      boundDeviceId: 'offline-device',
      heterogeneousProvider: { type: 'codex' },
    };
    mocks.profile.data = { agencyConfig };
    mocks.effectiveConfig = { agencyConfig, isPreferenceLoading: false, workspaceScoped: false };
    mocks.devices = [{ deviceId: 'offline-device', online: false, scope: 'personal' }];
    const onSelect = vi.fn();
    const { getByText, getByRole } = render(
      <ConfiguredAgentRow
        active
        row={{ id: 'offline', title: 'Offline Agent' }}
        onConfigure={vi.fn()}
        onSelect={onSelect}
      />,
    );
    expect(getByText('agentPicker.status.offline')).toBeDefined();
    const button = getByRole('button', { name: /Offline Agent/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  listSelect: vi.fn(),
  navigate: vi.fn(),
  setState: vi.fn(),
  taskAgentId: 'agt_task',
  updateSystemStatus: vi.fn(),
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

vi.mock('@/features/Home/AgentSelect/AgentList', () => ({
  default: ({
    activeAgentId,
    includeTaskAgent,
    onSelect,
  }: {
    activeAgentId: string;
    includeTaskAgent?: boolean;
    onSelect: (id: string) => void;
  }) => {
    mocks.listSelect({ activeAgentId, includeTaskAgent });
    return (
      <div>
        <button data-agent-id="agt_other" onClick={() => onSelect('agt_other')}>
          Other Agent
        </button>
        <button data-agent-id={activeAgentId} onClick={() => onSelect(activeAgentId)}>
          Current Row
        </button>
      </div>
    );
  },
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

vi.mock('@/store/chat/utils/messageMapKey', () => ({
  messageMapKey: ({ agentId, topicId }: { agentId: string; topicId?: string }) =>
    `${agentId}_${topicId ?? 'blank'}`,
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

vi.mock('../../draftStorage', () => ({
  getDraft: vi.fn(() => undefined),
  removeDraft: vi.fn(),
  saveDraft: vi.fn(),
}));

vi.mock('../../hooks/useAgentId', () => ({
  useAgentId: () => mocks.agentId,
}));

describe('Agent action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentId = 'agt_current';
    mocks.chatState.activeTopicId = undefined;
  });

  it('shows the bound agent avatar and display name on the chip', () => {
    const { getByTestId } = render(<Agent />);

    const avatar = getByTestId('avatar');
    expect(avatar.dataset.avatar).toBe('current-avatar');
    expect(getByTestId('popover-trigger').textContent).toContain('Current Agent');
    expect(mocks.fetchAgentList).toHaveBeenCalledOnce();
    // The dropdown must offer the builtin task agent as a conversation target.
    expect(mocks.listSelect).toHaveBeenCalledWith(
      expect.objectContaining({ activeAgentId: 'agt_current', includeTaskAgent: true }),
    );
  });

  it('retargets the blank composer pick without navigating or confirming', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));

    expect(mocks.setState).toHaveBeenCalledWith(
      { composerAgentId: 'agt_other' },
      false,
      'composerAgent/switch',
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

  it('Continue rebinds the topic in place and navigates to it', async () => {
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
    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_other/tpc_1');
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
    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_other/tpc_forked');
  });

  it('does nothing when the current agent is re-picked', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Current Row'));

    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.createModal).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

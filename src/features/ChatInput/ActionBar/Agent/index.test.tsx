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
  },
  agentId: 'agt_current',
  fetchAgentList: vi.fn(),
  listSelect: vi.fn(),
  navigateToAgent: vi.fn(),
}));

vi.mock('@lobehub/ui/base-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // The real Popover only mounts its content after an open interaction; the
  // assertions read the agent list synchronously.
  Popover: ({ children, content }: { children: ReactNode; content: ReactNode }) => (
    <div>
      <div data-testid="popover-trigger">{children}</div>
      <div data-testid="popover-content">{content}</div>
    </div>
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

vi.mock('@/hooks/useFetchAgentList', () => ({
  useFetchAgentList: () => {
    mocks.fetchAgentList();
    return { error: undefined, mutate: vi.fn() };
  },
}));

vi.mock('@/hooks/useInitBuiltinAgent', () => ({
  useInitBuiltinAgent: vi.fn(),
}));

vi.mock('@/hooks/useNavigateToAgent', () => ({
  useNavigateToAgent: () => mocks.navigateToAgent,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: typeof mocks) => unknown) => selector(mocks),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    getAgentMetaById: (id: string) => (s: typeof mocks) => s.agentMap[id] ?? {},
  },
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

  it('navigates to the picked agent conversation', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Other Agent'));
    expect(mocks.navigateToAgent).toHaveBeenCalledWith('agt_other');
  });

  it('does not navigate when the current agent is re-picked', () => {
    const { getByText } = render(<Agent />);

    fireEvent.click(getByText('Current Row'));
    expect(mocks.navigateToAgent).not.toHaveBeenCalled();
  });
});

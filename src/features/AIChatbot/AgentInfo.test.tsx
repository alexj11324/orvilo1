import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentInfo } from './AgentInfo';

const state = vi.hoisted(() => ({
  config: { model: 'gpt-test', systemRole: '' } as Record<string, unknown> | undefined,
  meta: { description: '', title: 'Builder' },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/ChatInput/hooks/useAgentId', () => ({ useAgentId: () => 'agt_1' }));
vi.mock('@/store/agent', () => ({ useAgentStore: (selector: () => unknown) => selector() }));
vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    getAgentConfigById: () => () => state.config,
    getAgentMetaById: () => () => state.meta,
  },
}));

describe('AgentInfo', () => {
  beforeEach(() => {
    state.config = { model: 'gpt-test', systemRole: '' };
    state.meta = { description: '', title: 'Builder' };
  });

  it('renders nothing when the Agent has only a name, which the picker already shows', () => {
    const { container } = render(<AgentInfo />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the description and instructions when the Agent has them', () => {
    state.config = { model: 'gpt-test', systemRole: 'Review every change.' };
    state.meta = { description: 'Reviews pull requests', title: 'Reviewer' };

    render(<AgentInfo />);

    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Reviews pull requests')).toBeInTheDocument();
    expect(screen.getByText('Review every change.')).toBeInTheDocument();
  });
});

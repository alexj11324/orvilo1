import type { OrviloAgentChatConfig } from '@orvilo/types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ControlsForm from '../ControlsForm';

interface TestAgentState {
  config: OrviloAgentChatConfig;
  model: string;
  provider: string;
}

interface TestAiState {
  extendParams: string[];
}

// Mock only the domain read/write boundary. RHF, local Field/Switch, the public
// sliders, their value conversions, and native keyboard events remain real.
const testState = vi.hoisted(() => ({
  agentState: {
    config: {},
    model: 'gpt-4',
    provider: 'openai',
  } as TestAgentState,
  aiState: { extendParams: ['enableReasoning'] } as TestAiState,
  updateAgentChatConfig: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/ChatInput/hooks/useAgentId', () => ({
  useAgentId: () => 'agent-1',
}));

vi.mock('@/features/ChatInput/hooks/useUpdateAgentConfig', () => ({
  useUpdateAgentConfig: () => ({ updateAgentChatConfig: testState.updateAgentChatConfig }),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: <T,>(selector: (state: TestAgentState) => T) => selector(testState.agentState),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentByIdSelectors: {
    getAgentModelById: () => (state: TestAgentState) => state.model,
    getAgentModelProviderById: () => (state: TestAgentState) => state.provider,
  },
  chatConfigByIdSelectors: {
    getChatConfigById: () => (state: TestAgentState) => state.config,
  },
}));

vi.mock('@/store/aiInfra', () => ({
  aiModelSelectors: {
    modelExtendParams: () => (state: TestAiState) => state.extendParams,
  },
  useAiInfraStore: <T,>(selector: (state: TestAiState) => T) => selector(testState.aiState),
}));

describe('ControlsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.updateAgentChatConfig.mockResolvedValue(undefined);
    testState.agentState = { config: {}, model: 'gpt-4', provider: 'openai' };
    testState.aiState = { extendParams: ['enableReasoning'] };
  });

  it('shows legacy thinking values without persisting derived defaults', async () => {
    testState.agentState.config = { thinking: 'disabled' };
    const { unmount } = render(<ControlsForm model="gpt-4" provider="openai" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
    unmount();

    testState.agentState.config = { thinking: 'enabled' };
    render(<ControlsForm model="gpt-4" provider="openai" />);
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('shows the model adaptive default without writing it', () => {
    testState.aiState.extendParams = ['enableAdaptiveThinking'];
    render(<ControlsForm model="claude-sonnet-5" provider="orvilo" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('preserves an explicit adaptive false override', () => {
    testState.agentState.config = { enableAdaptiveThinking: false };
    testState.aiState.extendParams = ['enableAdaptiveThinking'];
    render(<ControlsForm model="claude-sonnet-5" provider="orvilo" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('writes only the changed raw field and keeps the async updating lifetime', async () => {
    const user = userEvent.setup();
    let finishWrite!: () => void;
    testState.updateAgentChatConfig.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    const onUpdatingChange = vi.fn();
    render(<ControlsForm onUpdatingChange={onUpdatingChange} />);
    await user.click(screen.getByRole('switch'));
    expect(testState.updateAgentChatConfig).toHaveBeenCalledExactlyOnceWith({
      enableReasoning: true,
    });
    expect(onUpdatingChange.mock.calls).toEqual([[true]]);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    finishWrite();
    await waitFor(() => expect(onUpdatingChange.mock.calls).toEqual([[true], [false]]));
  });

  it('uses the explicit config and write sink instead of the agent default', async () => {
    const user = userEvent.setup();
    const onChatConfigChange = vi.fn().mockResolvedValue(undefined);
    testState.agentState.config = { enableReasoning: true };
    render(
      <ControlsForm
        chatConfig={{ enableReasoning: false }}
        onChatConfigChange={onChatConfigChange}
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('switch'));
    expect(onChatConfigChange).toHaveBeenCalledExactlyOnceWith({ enableReasoning: true });
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('merges a refreshed config while preserving omitted legacy fields without saving', async () => {
    testState.aiState.extendParams = ['reasoningEffort'];
    const { rerender } = render(<ControlsForm chatConfig={{ reasoningEffort: 'high' }} />);
    expect(screen.getByRole('button', { name: 'high', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    rerender(<ControlsForm chatConfig={{ urlContext: false }} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'high', exact: true })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    );
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('keeps model hint order, filters unsupported and hidden reasoning fields', () => {
    testState.aiState.extendParams = [
      'urlContext',
      'not-a-field',
      'reasoningEffort',
      'enableReasoning',
    ];
    render(<ControlsForm hideReasoningParams />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAccessibleName('extendParams.urlContext.title');
    expect(switches[1]).toHaveAccessibleName('extendParams.enableReasoning.title');
    expect(screen.queryByRole('button', { name: 'high', exact: true })).not.toBeInTheDocument();
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('disables native keyboard access to adaptive thinking when the public form is disabled', async () => {
    const user = userEvent.setup();
    testState.aiState.extendParams = ['enableAdaptiveThinking'];
    render(<ControlsForm disabled model="claude-sonnet-5" provider="orvilo" />);
    const control = screen.getByRole('switch');
    // Base UI's local Switch renders a span: its public disabled state must
    // remove keyboard focus as well as expose aria-disabled. The legacy
    // adaptive button omits disabled and must fail this same public contract.
    // Visit the finite tab cycle, including the real tooltip trigger, rather
    // than assuming the switch is the first focusable element.
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(control).not.toHaveFocus();
    }
    expect(control).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard(' ');
    expect(control).toHaveAttribute('aria-checked', 'true');
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
  });

  it('preserves the inverse context-cache switch mapping', async () => {
    const user = userEvent.setup();
    testState.aiState.extendParams = ['disableContextCaching'];
    render(<ControlsForm chatConfig={{ disableContextCaching: false }} />);
    const control = screen.getByRole('switch');
    expect(control).toHaveAttribute('aria-checked', 'true');
    await user.click(control);
    expect(testState.updateAgentChatConfig).toHaveBeenLastCalledWith({
      disableContextCaching: true,
    });
    await user.click(control);
    expect(testState.updateAgentChatConfig).toHaveBeenLastCalledWith({
      disableContextCaching: false,
    });
  });

  it('retains the 64k/32k/80k slider maps and writes each public field name', async () => {
    const user = userEvent.setup();
    const cases = [
      ['reasoningBudgetToken', '64k', 65536],
      ['reasoningBudgetToken32k', '32k', 32768],
      ['reasoningBudgetToken80k', '80k', 81920],
    ] as const;
    for (const [name, label, value] of cases) {
      testState.aiState.extendParams = [name];
      const { unmount } = render(<ControlsForm />);
      await user.click(screen.getByRole('button', { name: label, exact: true }));
      expect(testState.updateAgentChatConfig).toHaveBeenLastCalledWith({ [name]: value });
      unmount();
    }
  });

  it('keeps budget zero and automatic minus-one distinct', async () => {
    const user = userEvent.setup();
    testState.aiState.extendParams = ['thinkingBudget'];
    render(<ControlsForm chatConfig={{ thinkingBudget: 512 }} />);
    await user.click(screen.getByRole('button', { name: 'OFF', exact: true }));
    expect(testState.updateAgentChatConfig).toHaveBeenLastCalledWith({ thinkingBudget: 0 });
    await user.click(screen.getByRole('button', { name: 'Auto', exact: true }));
    expect(testState.updateAgentChatConfig).toHaveBeenLastCalledWith({ thinkingBudget: -1 });
  });

  it('keeps the GPT 5.5 display default and actual selected raw effort', async () => {
    const user = userEvent.setup();
    testState.aiState.extendParams = ['gpt5_2ReasoningEffort'];
    render(<ControlsForm model="gpt-5.5" />);
    const group = screen.getByRole('group', { name: 'extendParams.reasoningEffort.title' });
    expect(within(group).getByRole('button', { name: 'medium', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(testState.updateAgentChatConfig).not.toHaveBeenCalled();
    await user.click(within(group).getByRole('button', { name: 'xhigh', exact: true }));
    expect(testState.updateAgentChatConfig).toHaveBeenCalledExactlyOnceWith({
      gpt5_2ReasoningEffort: 'xhigh',
    });
  });
});

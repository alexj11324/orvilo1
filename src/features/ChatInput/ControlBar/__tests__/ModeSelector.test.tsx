import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ModeSelector from '../ModeSelector';

const toggleMode = vi.hoisted(() => vi.fn());
const modeState = vi.hoisted(() => ({
  canSelectAgentMode: true,
  currentMode: 'agent',
  isAgentModeUnavailable: false,
  isPreferenceLoading: false,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/business/client/hooks/useBusinessAgentMode', () => ({
  useBusinessAgentModeSync: vi.fn(),
}));
vi.mock('@/features/ChatInput/hooks/useAgentId', () => ({ useAgentId: () => 'agent-1' }));
vi.mock('@/features/ChatInput/hooks/useToggleAgentMode', () => ({
  useToggleAgentMode: () => toggleMode,
}));
vi.mock('@/features/ChatInput/hooks/useEffectiveAgentMode', () => ({
  useEffectiveAgentMode: () => modeState,
}));
vi.mock('@/features/ChatInput/hooks/useChatInputResourceAccess', () => ({
  useChatInputResourceAccess: () => ({ canUseResource: true, isGroupContext: false }),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));

beforeEach(() => {
  toggleMode.mockReset();
  modeState.canSelectAgentMode = true;
});

describe('ModeSelector keyboard choices', () => {
  it('offers focusable mode choices and selects Chat with Enter', async () => {
    const user = userEvent.setup();
    render(<ModeSelector />);
    await user.click(screen.getByRole('button', { name: 'chatMode.agent' }));
    const chatChoice = await screen.findByRole('button', {
      name: /chatMode.chat chatMode.chatDesc/,
    });
    chatChoice.focus();
    await user.keyboard('{Enter}');
    expect(toggleMode).toHaveBeenCalledWith(false);
  });

  it('keeps unavailable Agent mode disabled and selects Chat with Space', async () => {
    modeState.canSelectAgentMode = false;
    const user = userEvent.setup();
    render(<ModeSelector />);
    await user.click(screen.getByRole('button', { name: 'chatMode.agent' }));
    expect(
      await screen.findByRole('button', { name: /chatMode.agent chatMode.agentUnsupported/ }),
    ).toBeDisabled();
    const chatChoice = screen.getByRole('button', { name: /chatMode.chat chatMode.chatDesc/ });
    chatChoice.focus();
    await user.keyboard(' ');
    expect(toggleMode).toHaveBeenCalledWith(false);
  });
});

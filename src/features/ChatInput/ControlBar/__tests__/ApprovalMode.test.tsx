import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ApprovalMode from '../ApprovalMode';

const updateHumanIntervention = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/features/ChatInput/hooks/useChatInputResourceAccess', () => ({
  useChatInputResourceAccess: () => ({ canUseResource: true, isGroupContext: false }),
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: object) => unknown) => selector({ updateHumanIntervention }),
}));
vi.mock('@/store/user/selectors', () => ({
  toolInterventionSelectors: { approvalMode: () => 'manual' },
}));
beforeEach(() => updateHumanIntervention.mockReset());

describe('ApprovalMode trigger', () => {
  it('uses one native button as the menu trigger and opens it with Enter', async () => {
    const user = userEvent.setup();
    render(<ApprovalMode />);
    const trigger = screen.getByRole('button', { name: 'tool.intervention.mode.manual' });
    expect(trigger).toHaveAttribute('data-slot', 'dropdown-menu-trigger');
    expect(trigger.closest('[data-slot="dropdown-menu-trigger"]')).toBe(trigger);
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tool.intervention.mode.manual' })).toBe(trigger);
    const choice = await screen.findByRole('menuitem', { name: /tool.intervention.mode.autoRun / });
    choice.focus();
    await user.keyboard('{Enter}');
    expect(updateHumanIntervention).toHaveBeenCalledWith({ approvalMode: 'auto-run' });
  });
});

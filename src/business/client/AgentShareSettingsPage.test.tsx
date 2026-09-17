import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AgentShareSettingsPage from '@/business/client/AgentShareSettingsPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  params: { aid: 'agt_share' } as { aid?: string },
}));

vi.mock('react-router', () => ({
  useParams: () => mocks.params,
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

afterEach(() => {
  cleanup();
  mocks.navigate.mockReset();
  mocks.params = { aid: 'agt_share' };
});

describe('open-source Agent Share settings slot', () => {
  // The route stays registered after the surface retires, so /agent/:aid/share is
  // still reachable — a pasted link, a bookmark, or a share published earlier all
  // land here. Returning null answered those with a blank page, which reads as a
  // broken build rather than as a deployment that does not offer the surface.
  it('explains that the surface is unavailable instead of rendering nothing', () => {
    render(<AgentShareSettingsPage />);

    expect(screen.getByText('share.unavailable.title')).toBeInTheDocument();
    expect(screen.getByText('share.unavailable.desc')).toBeInTheDocument();
  });

  it('offers the way back to the Agent', async () => {
    render(<AgentShareSettingsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'share.unavailable.action' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/agent/agt_share', { replace: true });
  });

  // Without an id there is no Agent to point at; dropping the action here is what
  // keeps the notice from offering a link to `/agent/undefined`.
  it('does not offer a back action when the URL carries no Agent id', () => {
    mocks.params = {};

    render(<AgentShareSettingsPage />);

    expect(screen.queryByRole('button', { name: 'share.unavailable.action' })).toBeNull();
  });
});

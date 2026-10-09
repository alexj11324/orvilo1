import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import OnboardingPage from './index';

const api = vi.hoisted(() => ({
  updateFullName: vi.fn(),
  updateOnboarding: vi.fn().mockResolvedValue(undefined),
  resolveWorkspace: vi.fn().mockResolvedValue({ id: 'new-workspace', slug: 'my-workspace' }),
  navigate: vi.fn(),
  finish: vi.fn(),
  ensure: vi.fn().mockResolvedValue(undefined),
  savedAgent: vi.fn().mockResolvedValue({
    agencyConfig: { executionTarget: 'local', heterogeneousProvider: { type: 'opencode' } },
  }),
}));
vi.mock('@/app/globals.css', () => ({}));
vi.mock('react-router', () => ({
  useNavigate: () => api.navigate,
  useLocation: () => ({ pathname: '/onboarding', search: '' }),
}));
vi.mock('@/store/user', () => {
  const state = {
    user: { fullName: '' },
    onboarding: {},
    updateFullName: api.updateFullName,
    updateOnboarding: api.updateOnboarding,
  };
  return {
    useUserStore: Object.assign((select: (value: typeof state) => unknown) => select(state), {
      getState: () => state,
    }),
  };
});
vi.mock('./DesktopAuthGate', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./useOnboardingUserStateReady', () => ({ useOnboardingUserStateReady: () => true }));
vi.mock('./workspaceResolution', () => ({
  findOnboardingWorkspace: vi.fn().mockResolvedValue(undefined),
  resolveOnboardingWorkspace: api.resolveWorkspace,
}));
vi.mock('./finishOnboarding', () => ({
  finishOnboardingAndNavigate: api.finish,
  repairDesktopOnboardingMarkers: vi.fn(),
}));
vi.mock('@/utils/onboardingRedirect', () => ({
  clearStaleOnboardingCallbackUrl: vi.fn(),
  resolvePostOnboardingTargetUrl: vi.fn(),
  stashOnboardingCallbackUrl: vi.fn(),
}));
vi.mock('@/features/CreateAgent/CreateAgentPanel', () => ({
  default: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <button onClick={() => onCreated('first-saved-agent')}>Configure Agent</button>
  ),
}));
vi.mock('@/services/orchestrator', () => ({
  getOnboardingAgentConfig: api.savedAgent,
  resolveOnboardingAgentHost: () => ({ executionTarget: 'device' }),
  verifyOnboardingOrchestrator: vi.fn(),
}));
vi.mock('@/services/agentOnboarding', () => ({ ensureFirstAgentInWorkspace: api.ensure }));
vi.mock('@/components/blocks/onboarding-2/components/onboarding-header', () => ({
  OnboardingHeader: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('lets an authenticated user with no profile name set up a workspace without changing the profile', async () => {
  render(<OnboardingPage />);
  fireEvent.change(document.querySelector('#onboarding-workspace')!, {
    target: { value: 'My workspace' },
  });
  fireEvent.change(document.querySelector('#onboarding-url')!, {
    target: { value: 'my-workspace' },
  });
  const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(screen.getByText('Configure Agent')).toBeTruthy());
  expect(api.resolveWorkspace).toHaveBeenCalledOnce();
  expect(api.updateFullName).not.toHaveBeenCalled();
  expect(document.querySelector('#onboarding-name')).toBeNull();
});

vi.mock('@/features/Orchestrator/ConfiguredOrchestratorSelector', () => ({
  default: ({ value }: { value?: string }) => <div>Orchestrator choice: {value}</div>,
}));

it('keeps the first saved Agent as the Orchestrator choice and does not finish after Agent setup', async () => {
  render(<OnboardingPage />);
  fireEvent.change(document.querySelector('#onboarding-workspace')!, {
    target: { value: 'My workspace' },
  });
  fireEvent.change(document.querySelector('#onboarding-url')!, {
    target: { value: 'my-workspace' },
  });
  fireEvent.click(document.querySelector<HTMLButtonElement>('button[type="submit"]')!);
  await waitFor(() => expect(screen.getByText('Configure Agent')).toBeTruthy());
  fireEvent.click(screen.getByText('Configure Agent'));
  await waitFor(() =>
    expect(screen.getByText('Orchestrator choice: first-saved-agent')).toBeTruthy(),
  );
  expect(api.ensure).toHaveBeenCalledTimes(1);
  expect(api.finish).not.toHaveBeenCalled();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import OnboardingPage from './index';

const api = vi.hoisted(() => ({
  updateFullName: vi.fn(),
  updateOnboarding: vi.fn().mockResolvedValue(undefined),
  resolveWorkspace: vi.fn().mockResolvedValue({ id: 'new-workspace', slug: 'my-workspace' }),
  navigate: vi.fn(),
  finish: vi.fn().mockImplementation(async (_finish, _navigate, prepare) => {
    await prepare?.();
  }),
  verify: vi.fn().mockResolvedValue(undefined),
  scope: vi.fn(),
  ensure: vi.fn().mockResolvedValue(undefined),
  savedAgent: vi.fn().mockResolvedValue({
    agencyConfig: { executionTarget: 'local', heterogeneousProvider: { type: 'opencode' } },
  }),
}));
vi.mock('@/business/client/workspaceContextStore', () => ({
  getWorkspaceContextState: () => ({ setActiveWorkspace: api.scope }),
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
  default: ({
    onCreated,
    visibility,
    lockVisibility,
  }: {
    onCreated: (id: string) => void;
    visibility?: string;
    lockVisibility?: boolean;
  }) => (
    <button
      data-locked={lockVisibility}
      data-visibility={visibility ?? 'private'}
      onClick={() => onCreated(visibility === 'public' ? 'new-public-agent' : 'first-saved-agent')}
    >
      {visibility === 'public' ? 'Create public Agent' : 'Configure Agent'}
    </button>
  ),
}));
vi.mock('@/services/orchestrator', () => ({
  getOnboardingAgentConfig: api.savedAgent,
  resolveOnboardingAgentHost: () => ({ executionTarget: 'device' }),
  verifyOnboardingOrchestrator: api.verify,
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
  default: ({
    value,
    visibility,
    onSelect,
  }: {
    value?: string;
    visibility?: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="orchestrator-selector" data-visibility={visibility}>
      <span>Orchestrator choice: {value ?? 'none'}</span>
      <button onClick={() => onSelect('existing-public-agent')}>Select public Agent</button>
    </div>
  ),
}));

it('keeps the first saved Agent private and requires a separate public Orchestrator choice', async () => {
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
  await waitFor(() => expect(screen.getByText('Orchestrator choice: none')).toBeTruthy());
  expect(api.ensure).toHaveBeenCalledTimes(1);
  expect(api.scope).toHaveBeenCalledWith({ id: 'new-workspace', slug: 'my-workspace' });
  expect(screen.getByTestId('orchestrator-selector')).toHaveAttribute('data-visibility', 'public');
  expect(screen.getByText('setup.orchestrator.finish')).toBeDisabled();
  expect(api.finish).not.toHaveBeenCalled();
});

const reachOrchestratorStep = async () => {
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
  await waitFor(() => expect(screen.getByText('Orchestrator choice: none')).toBeTruthy());
};

it('finishes private-first setup with an existing public source without changing the first Agent', async () => {
  await reachOrchestratorStep();
  fireEvent.click(screen.getByText('Select public Agent'));
  await waitFor(() => expect(screen.getByText('setup.orchestrator.finish')).not.toBeDisabled());
  fireEvent.click(screen.getByText('setup.orchestrator.finish'));
  await waitFor(() =>
    expect(api.verify).toHaveBeenCalledWith('existing-public-agent', 'new-workspace', {
      alsoDefault: true,
    }),
  );
  expect(api.ensure).toHaveBeenCalledTimes(1);
  expect(api.ensure.mock.calls[0][0]).toBe('first-saved-agent');
});

it('explicitly creates a new public workspace source and retains the private first Agent', async () => {
  await reachOrchestratorStep();
  fireEvent.click(screen.getByText('setup.orchestrator.create'));
  const create = screen.getByText('Create public Agent');
  expect(create).toHaveAttribute('data-visibility', 'public');
  expect(create).toHaveAttribute('data-locked', 'true');
  fireEvent.click(create);
  await waitFor(() =>
    expect(screen.getByText('Orchestrator choice: new-public-agent')).toBeTruthy(),
  );
  fireEvent.click(screen.getByText('setup.orchestrator.finish'));
  await waitFor(() =>
    expect(api.verify).toHaveBeenCalledWith('new-public-agent', 'new-workspace', {
      alsoDefault: true,
    }),
  );
  expect(api.ensure).toHaveBeenCalledTimes(1);
  expect(api.ensure.mock.calls[0][0]).toBe('first-saved-agent');
});

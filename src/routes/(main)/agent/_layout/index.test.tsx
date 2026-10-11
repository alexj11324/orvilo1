/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Layout from './index';

vi.mock('react-router', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router')) as typeof import('react-router');

  return {
    ...actual,
    Outlet: () => <div data-testid="agent-layout-outlet">outlet</div>,
    useLocation: () => ({ pathname: '/agent/agt_1' }),
  };
});

vi.mock(import('@/const/version'), async (importOriginal) => ({
  ...(await importOriginal()),
  isDesktop: false,
}));
vi.mock(import('@/features/HeterogeneousAgent/builtinHarness'), async (importOriginal) => ({
  ...(await importOriginal()),
  useBuiltinHarnessOffered: () => true,
}));
vi.mock('@/features/DefaultAgent/useDefaultAgent', () => ({
  useDefaultAgentState: () => ({ agent: undefined, ready: true }),
}));
vi.mock('@/hooks/useFetchAgentList', () => ({ useFetchAgentList: vi.fn(() => ({})) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/hooks/useInitAgentConfig', () => ({ useInitAgentConfig: vi.fn() }));
vi.mock('@/features/ProtocolUrlHandler', () => ({ default: () => null }));
vi.mock('./RegisterHotkeys', () => ({ default: () => null }));
vi.mock('@/features/AgentSidebar', () => ({
  default: () => <div data-testid="agent-layout-sidebar" />,
}));
vi.mock('@/routes/(main)/agent/_layout/AgentIdSync', () => ({
  default: () => <div data-testid="agent-layout-agent-id-sync" />,
}));

describe('Agent layout', () => {
  it('renders sidebar and outlet', () => {
    render(<Layout />);

    expect(screen.getByTestId('agent-layout-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('agent-layout-outlet')).toBeInTheDocument();
  });

  it('mounts AgentIdSync in layout', () => {
    render(<Layout />);

    expect(screen.getByTestId('agent-layout-agent-id-sync')).toBeInTheDocument();
  });
});

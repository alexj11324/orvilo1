import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AgentRules from './index';

const mocks = vi.hoisted(() => ({
  overview: {
    data: undefined as unknown,
    error: undefined as unknown,
    isLoading: false,
    mutate: vi.fn(),
  },
}));

vi.mock('@/features/SelfLearning/hooks', () => ({
  useExpertiseOverview: () => mocks.overview,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) => selector({ activeAgentId: 'agt_1' }),
}));

vi.mock('react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

beforeEach(() => {
  mocks.overview = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
});

afterEach(cleanup);

describe('AgentRules', () => {
  // Regression: a failed overview fetch used to fall through to the empty copy,
  // so a broken request read as "this agent has no rules" with no way to retry.
  it('surfaces a retryable error instead of the empty copy', () => {
    mocks.overview = {
      data: undefined,
      error: new Error('boom'),
      isLoading: false,
      mutate: vi.fn(),
    };

    render(<AgentRules />);

    expect(screen.queryByText('agentRules.empty')).not.toBeInTheDocument();
    expect(screen.getByText('asyncState.title')).toBeInTheDocument();
    expect(screen.getByText('error.retry')).toBeInTheDocument();
  });

  it('retries the same request', () => {
    const mutate = vi.fn();
    mocks.overview = { data: undefined, error: new Error('boom'), isLoading: false, mutate };

    render(<AgentRules />);
    fireEvent.click(screen.getByText('error.retry'));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('keeps the empty copy for a settled empty list', () => {
    mocks.overview = {
      data: { domains: [] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    };

    render(<AgentRules />);

    expect(screen.getByText('agentRules.empty')).toBeInTheDocument();
  });
});

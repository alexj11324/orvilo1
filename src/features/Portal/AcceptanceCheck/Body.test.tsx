import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Body from './Body';

const mocks = vi.hoisted(() => ({
  bundleError: undefined as Error | undefined,
  mutate: vi.fn(),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openAcceptance: vi.fn(),
      portalData: { acceptanceId: 'acc-1', checkId: 'check-1', type: 'acceptanceCheck' },
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  chatPortalSelectors: {
    acceptanceCheckPortal: (state: { portalData: { acceptanceId: string; checkId: string } }) =>
      state.portalData,
  },
}));

vi.mock('@/features/Acceptance', () => ({
  checkHeadMeta: () => ({ color: 'green', icon: () => null }),
  FocusedCheckDetails: () => <div data-testid={'check-details'} />,
  useAcceptanceBundle: () => ({
    data: {
      acceptance: { id: 'acc-1' },
      checks: [
        {
          id: 'check-1',
          planItem: {
            verifierConfig: {
              requiredEvidence: [{ type: 'markdown' }, { type: 'screenshot' }],
            },
            verifierType: 'agent',
          },
          seq: 3,
          title: 'The result keeps its title',
        },
      ],
      isOwner: true,
    },
    error: mocks.bundleError,
    isLoading: false,
    mutate: mocks.mutate,
  }),
}));

describe('AcceptanceCheck Portal Body', () => {
  beforeEach(() => {
    mocks.bundleError = undefined;
    mocks.mutate.mockReset();
  });

  it('renders the expanded check directly on a borderless detail surface', () => {
    render(<Body />);

    const checkDetails = screen.getByTestId('check-details');
    const surface = checkDetails.parentElement;

    expect(surface?.className).toContain('flex-col');
    expect(surface?.querySelector('[class*="block"]')).toBeNull();
  });

  it('keeps the selected check identity visible above its details', () => {
    render(<Body />);

    expect(screen.getByText('C3 · The result keeps its title')).toBeInTheDocument();
    expect(document.querySelector('span.anticon')).toBeInTheDocument();
  });

  it('shows how the task check is verified and which evidence media it requires', () => {
    render(<Body />);

    expect(screen.getByText('taskDetail.acceptance.verifier')).toBeInTheDocument();
    expect(screen.getByText('criterion.verifierType.agent')).toBeInTheDocument();
    expect(screen.getByText('taskDetail.acceptance.multimodalLlm')).toBeInTheDocument();
    expect(screen.getByText('taskDetail.acceptance.requiredEvidence')).toBeInTheDocument();
    expect(screen.getByText('report.evidence.medium.markdown')).toBeInTheDocument();
    expect(screen.getByText('report.evidence.medium.screenshot')).toBeInTheDocument();
    const verifierLabel = screen.getByText('taskDetail.acceptance.verifier');
    const evidenceLabel = screen.getByText('taskDetail.acceptance.requiredEvidence');
    expect(verifierLabel.parentElement?.parentElement).toBe(
      evidenceLabel.parentElement?.parentElement,
    );
  });

  it('offers an in-place retry when loading the selected check fails', () => {
    mocks.bundleError = new Error('network failed');

    render(<Body />);

    fireEvent.click(screen.getByRole('button', { name: 'taskDetail.acceptance.retry' }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
});

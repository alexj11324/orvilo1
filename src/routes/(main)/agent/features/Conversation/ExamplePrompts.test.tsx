/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ExamplePrompts from './ExamplePrompts';

const mocks = vi.hoisted(() => ({
  dismissed: false,
  fillInputMessage: vi.fn(),
  updateSystemStatus: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { ns?: string }) => `${options?.ns ? `${options.ns}:` : ''}${key}`,
  }),
}));

vi.mock('@/features/Conversation/store', () => ({
  useConversationStore: (selector: (state: unknown) => unknown) =>
    selector({ fillInputMessage: mocks.fillInputMessage }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: unknown) => unknown) =>
    selector({
      status: { inboxAgentExamplesDismissed: mocks.dismissed },
      updateSystemStatus: mocks.updateSystemStatus,
    }),
}));

describe('ExamplePrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dismissed = false;
  });

  it('renders the heading and the three reference example cards', () => {
    render(<ExamplePrompts />);

    expect(screen.getByText('examples.title')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-agent-example-createProject')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-agent-example-researchTopic')).toBeInTheDocument();
    expect(screen.getByTestId('inbox-agent-example-draftUpdate')).toBeInTheDocument();
  });

  it('fills the composer with the card title when a card is clicked', () => {
    render(<ExamplePrompts />);

    fireEvent.click(screen.getByTestId('inbox-agent-example-researchTopic'));

    expect(mocks.fillInputMessage).toHaveBeenCalledWith('examples.researchTopic.title');
  });

  it('persists dismissal through system status when Dismiss is clicked', () => {
    render(<ExamplePrompts />);

    fireEvent.click(screen.getByRole('button', { name: 'examples.dismiss' }));

    expect(mocks.updateSystemStatus).toHaveBeenCalledWith({ inboxAgentExamplesDismissed: true });
  });

  it('renders nothing once dismissed', () => {
    mocks.dismissed = true;

    const { container } = render(<ExamplePrompts />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('inbox-agent-examples')).not.toBeInTheDocument();
  });
});

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import TopicPanel from './TopicPanel';

// The real ActionIcon surfaces its title as aria-label; keep the stub so the
// assertion stays a plain accessible-name query.
vi.mock('@/components/ActionIcon', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: ({ onClick, title }: { onClick?: () => void; title?: string }) =>
    createElement('button', { 'aria-label': title, onClick }, title),
}));

vi.mock('@/features/AgentTasks/AgentTaskDetail/TopicChatDrawer', () => ({
  TopicChatDrawerBody: ({
    agentId,
    defaultInputExpanded,
    disableInputCollapse,
    topicId,
  }: {
    agentId: string;
    defaultInputExpanded?: boolean;
    disableInputCollapse?: boolean;
    topicId: string;
  }) =>
    createElement(
      'div',
      {
        'data-default-input-expanded': String(defaultInputExpanded),
        'data-disable-input-collapse': String(disableInputCollapse),
        'data-testid': 'topic-conversation',
      },
      `${agentId}:${topicId}`,
    ),
}));

describe('TopicPanel', () => {
  it('shows the agent avatar and only a collapse action in the conversation rail', () => {
    const onCollapse = vi.fn();
    const { getByLabelText, getByTestId, getByText, queryByTitle } = render(
      createElement(TopicPanel, {
        agentAvatar: '🤖',
        agentId: 'agent-1',
        onCollapse,
        title: 'Origin topic',
        topicId: 'topic-1',
      }),
    );

    expect(getByText('Origin topic')).toBeTruthy();
    expect(getByTestId('topic-conversation')).toHaveAttribute(
      'data-default-input-expanded',
      'true',
    );
    expect(getByTestId('topic-conversation')).toHaveAttribute(
      'data-disable-input-collapse',
      'true',
    );
    expect(getByTestId('topic-conversation').textContent).toBe('agent-1:topic-1');

    expect(getByLabelText('🤖')).toBeTruthy();
    expect(queryByTitle('acceptance.origin.backToRuns')).toBeNull();

    fireEvent.click(getByLabelText('acceptance.ledger.collapse'));
    expect(onCollapse).toHaveBeenCalledOnce();
  });
});

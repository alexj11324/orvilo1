/** @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import InboxAgentLanding, { shouldShowInboxAgentLanding } from './InboxAgentLanding';

afterEach(cleanup);

describe('shouldShowInboxAgentLanding', () => {
  it('uses the centered landing only for the inbox without an active topic', () => {
    expect(
      shouldShowInboxAgentLanding({
        agentId: 'inbox-agent',
        inboxAgentId: 'inbox-agent',
        topicId: null,
      }),
    ).toBe(true);
  });

  it('keeps populated inbox conversations on the conversation renderer', () => {
    expect(
      shouldShowInboxAgentLanding({
        agentId: 'inbox-agent',
        inboxAgentId: 'inbox-agent',
        topicId: 'topic-1',
      }),
    ).toBe(false);
  });

  it('keeps user-created agents on the conversation renderer', () => {
    expect(
      shouldShowInboxAgentLanding({
        agentId: 'custom-agent',
        inboxAgentId: 'inbox-agent',
      }),
    ).toBe(false);
  });

  it('keeps a multiline authorization stack inside a vertically scrollable landing', () => {
    const authorizationRows = createElement(
      'div',
      null,
      ...Array.from({ length: 8 }, (_, index) =>
        createElement('button', { key: index }, `Authorize connector ${index + 1}`),
      ),
    );

    render(createElement(InboxAgentLanding, null, authorizationRows));

    const scrollRegion = screen.getByTestId('inbox-agent-landing-scroll-region');
    const content = screen.getByTestId('inbox-agent-landing-content');
    const lastAuthorizationAction = screen.getByRole('button', {
      name: 'Authorize connector 8',
    });

    expect(scrollRegion).toContainElement(content);
    expect(content).toContainElement(lastAuthorizationAction);
    expect(getComputedStyle(scrollRegion).overflow).toBe('hidden auto');
  });
});

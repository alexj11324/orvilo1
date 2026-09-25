/** @vitest-environment happy-dom */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import InboxAgentLanding, {
  isInboxAgentRouteTarget,
  shouldShowInboxAgentLanding,
  shouldShowInboxAgentResolving,
} from './InboxAgentLanding';

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

describe('isInboxAgentRouteTarget', () => {
  it('matches the unresolved `/agent/inbox` slug route', () => {
    expect(isInboxAgentRouteTarget({ agentId: 'inbox' })).toBe(true);
  });

  it('matches a hydrated row whose slug is the inbox builtin', () => {
    expect(isInboxAgentRouteTarget({ agentId: 'agt_abc', agentSlug: 'inbox' })).toBe(true);
  });

  it('rejects custom agents and unrelated ids', () => {
    expect(isInboxAgentRouteTarget({ agentId: 'agt_custom', agentSlug: 'helper' })).toBe(false);
    expect(isInboxAgentRouteTarget({ agentId: 'agt_custom' })).toBe(false);
    expect(isInboxAgentRouteTarget({})).toBe(false);
  });
});

describe('shouldShowInboxAgentResolving', () => {
  it('resolves the slug-route window while the builtin map is empty', () => {
    expect(
      shouldShowInboxAgentResolving({
        agentId: 'inbox',
        inboxAgentConfigInit: false,
        topicId: null,
      }),
    ).toBe(true);
  });

  it('resolves a direct real-id visit to the hydrated inbox row', () => {
    expect(
      shouldShowInboxAgentResolving({
        agentId: 'agt_inbox',
        agentSlug: 'inbox',
        inboxAgentConfigInit: false,
        topicId: null,
      }),
    ).toBe(true);
  });

  it('stops resolving once the builtin map lands', () => {
    expect(
      shouldShowInboxAgentResolving({
        agentId: 'inbox',
        inboxAgentConfigInit: true,
        topicId: null,
      }),
    ).toBe(false);
  });

  it('never resolves with an active topic or a non-inbox target', () => {
    expect(
      shouldShowInboxAgentResolving({
        agentId: 'inbox',
        inboxAgentConfigInit: false,
        topicId: 'topic-1',
      }),
    ).toBe(false);
    expect(
      shouldShowInboxAgentResolving({
        agentId: 'agt_custom',
        agentSlug: 'helper',
        inboxAgentConfigInit: false,
        topicId: null,
      }),
    ).toBe(false);
  });
});

/** @vitest-environment happy-dom */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import { cleanup, render, screen } from '@testing-library/react';
import postcss from 'postcss';
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

  it('keeps a multiline authorization stack inside a vertically scrollable landing', async () => {
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

    const globalsPath = path.resolve(process.cwd(), 'src/app/globals.css');
    const globals = postcss.parse(await readFile(globalsPath, 'utf8'), { from: globalsPath });
    // Compile only this rendered element's candidates, without discovering workspace sources.
    globals.walkAtRules('source', (rule) => {
      rule.remove();
    });
    globals.walkAtRules('import', (rule) => {
      if (/^(['"])tailwindcss\1(?:\s|$)/.test(rule.params)) {
        rule.params = rule.params.replace(/\s+source\([^)]*\)/, '') + ' source(none)';
      }
    });
    globals.append(
      postcss.atRule({
        name: 'source',
        params: `inline(${JSON.stringify([...scrollRegion.classList].join(' '))})`,
      }),
    );
    const { root: compiled } = await postcss([
      tailwindcss({ base: process.cwd(), optimize: false }),
    ]).process(globals, { from: globalsPath });
    const scrollStyles = postcss.root();
    // HappyDOM drops @layer rules. Project only matching, unconditional compiled overflow
    // declarations into consumable CSS; this tests axis semantics, not browser layer precedence.
    compiled.walkRules((rule) => {
      let parent = rule.parent;
      while (parent && parent.type !== 'root') {
        if (parent.type !== 'atrule' || parent.name !== 'layer') return;
        parent = parent.parent;
      }
      if (!scrollRegion.matches(rule.selector)) return;
      const declarations = rule.nodes.filter(
        (node) => node.type === 'decl' && /^overflow(?:-[xy])?$/.test(node.prop),
      );
      if (declarations.length === 0) return;
      scrollStyles.append(rule.clone({ nodes: declarations.map((node) => node.clone()) }));
    });
    const stylesheet = document.createElement('style');
    stylesheet.textContent = scrollStyles.toString();
    document.head.append(stylesheet);
    try {
      const computed = getComputedStyle(scrollRegion);
      expect(computed.overflowX).toBe('hidden');
      expect(computed.overflowY).toBe('auto');
    } finally {
      stylesheet.remove();
    }
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

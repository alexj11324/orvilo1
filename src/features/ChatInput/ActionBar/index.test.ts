/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { filterChatOnlyActions } from './filterChatOnlyActions';
import Token from './Token/TokenTag';

const tokenMocks = vi.hoisted(() => ({
  useTokenBreakdown: vi.fn(),
}));

vi.mock('@/components/ai-elements/context', () => ({
  Context: ({ usedTokens, children }: { usedTokens: number; children: ReactNode }) =>
    createElement(
      'div',
      {},
      createElement('span', { 'data-testid': 'token-tag' }, usedTokens),
      children,
    ),
  ContextTrigger: () => null,
  ContextContent: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
  ContextContentHeader: () => null,
  ContextContentBody: ({ children }: { children: ReactNode }) => createElement('div', {}, children),
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock('@/store/user/selectors', () => ({
  userGeneralSettingsSelectors: { config: () => ({ isDevMode: true }) },
}));

vi.mock('./Token/useTokenBreakdown', () => ({
  useTokenBreakdown: tokenMocks.useTokenBreakdown,
}));

beforeEach(() => {
  tokenMocks.useTokenBreakdown.mockReset();
});

describe('filterChatOnlyActions', () => {
  it('keeps runtime mode, attachments, formatting, and chat operations while hiding configuration actions', () => {
    expect(
      filterChatOnlyActions([
        'agentMode',
        'search',
        'memory',
        'fileUpload',
        'tools',
        'voiceDictation',
        '---',
        ['typo', 'params', 'clear'],
      ]),
    ).toEqual(['agentMode', 'fileUpload', 'voiceDictation', '---', ['typo', 'clear']]);
  });

  it('keeps the agent chip for chat-only members — it navigates, it does not configure', () => {
    expect(filterChatOnlyActions(['agent', 'params'])).toEqual(['agent']);
  });
});

describe('Context window token', () => {
  it('reuses the settled tag breakdown when rendering details', () => {
    tokenMocks.useTokenBreakdown
      .mockReturnValueOnce({
        chatsToken: 3000,
        historySummaryToken: 500,
        maxTokens: 8000,
        systemRoleToken: 1500,
        toolsToken: 1000,
        totalToken: 6000,
      })
      .mockReturnValue({
        chatsToken: 0,
        historySummaryToken: 0,
        maxTokens: 8000,
        systemRoleToken: 0,
        toolsToken: 0,
        totalToken: 0,
      });

    render(createElement(Token));

    expect(tokenMocks.useTokenBreakdown).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('token-tag')).toHaveTextContent('6000');
    expect(screen.getByText('6,000')).toBeInTheDocument();
    expect(screen.getByText('2,000')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
  });
});

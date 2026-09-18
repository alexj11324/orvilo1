import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WebHomeRedirect from './WebHomeRedirect';

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  replace: undefined as boolean | undefined,
  search: '',
  to: undefined as unknown,
}));

vi.mock('react-router', () => ({
  Navigate: ({ replace, to }: { replace?: boolean; to: unknown }) => {
    mocks.replace = replace;
    mocks.to = to;
    return null;
  },
  useLocation: () => ({ search: mocks.search }),
  useParams: () => mocks.params,
}));

/**
 * The URL that would actually be navigated to. `Navigate` accepts either a string
 * or a `Partial<Path>`, so the assertion is written against the resolved URL
 * rather than against one of the two shapes — otherwise a change of
 * representation with identical behaviour would fail.
 */
const navigatedUrl = (): string => {
  const { to } = mocks;
  if (typeof to === 'string') return to;
  if (to && typeof to === 'object') {
    const { pathname = '', search = '' } = to as { pathname?: string; search?: string };
    return `${pathname}${search}`;
  }
  return '';
};

afterEach(() => {
  cleanup();
  mocks.params = {};
  mocks.replace = undefined;
  mocks.search = '';
  mocks.to = undefined;
});

describe('the Web landing redirect', () => {
  it('lands on the task list', () => {
    render(<WebHomeRedirect />);

    expect(navigatedUrl()).toBe('/tasks');
  });

  it('keeps the workspace under a slug', () => {
    mocks.params = { workspaceSlug: 'team-a' };

    render(<WebHomeRedirect />);

    expect(navigatedUrl()).toBe('/team-a/tasks');
  });

  // Root-path links arrive with parameters attached — `?onboarding=task` is how
  // the post-onboarding entry asks for the board. Dropping them here would let
  // the landing redirect steal the link that brought the user in.
  it('carries the query across instead of dropping it', () => {
    mocks.search = '?onboarding=task';

    render(<WebHomeRedirect />);

    expect(navigatedUrl()).toBe('/tasks?onboarding=task');
  });

  it('replaces rather than pushes, so back does not bounce between the two', () => {
    render(<WebHomeRedirect />);

    expect(mocks.replace).toBe(true);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ownsRailSections } from '@/features/HomeInbox/railSectionPlacement';

import InboxPage from './InboxPage';

const mocks = vi.hoisted(() => ({
  inboxProps: undefined as undefined | Record<string, unknown>,
}));

// The inbox itself is exercised by its own suites; this one is about how the page
// mounts it, so it is replaced with a stub that can report its props.
vi.mock('@/features/HomeInbox', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.inboxProps = props;
    return <div>inbox</div>;
  },
}));

vi.mock('@/features/NavHeader', () => ({
  default: ({ left }: { left?: ReactNode }) => <div>{left}</div>,
}));

vi.mock('@/features/WideScreenContainer', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  mocks.inboxProps = undefined;
});

describe('inbox route page', () => {
  it('mounts the inbox', () => {
    render(<InboxPage />);

    expect(screen.getByText('inbox')).toBeInTheDocument();
  });

  // Asserted through the real predicate rather than by pinning prop values: this
  // page has no rail, so if the main column does not carry the rail's sections,
  // goals, the daily brief and usage are neither fetched nor rendered — silently,
  // and while every prop still looks reasonable. An earlier version of this test
  // asserted `variant === 'main'` alone, which is exactly the state that had the
  // bug, so it passed on a page that showed no briefs.
  it('mounts the inbox so its main column carries the sections the rail owns', () => {
    render(<InboxPage />);

    expect(ownsRailSections(mocks.inboxProps as never)).toBe(true);
  });

  it('mounts the full column variant, not the rail form', () => {
    render(<InboxPage />);

    expect(mocks.inboxProps?.variant).toBe('main');
  });

  // Without this the empty case renders the page title over a blank column
  // (HomeInbox returns null for an empty main column), which reads as a broken
  // build — the same failure the retired share route was fixed for.
  it('gives the inbox an empty state of its own', () => {
    render(<InboxPage />);

    expect(mocks.inboxProps?.emptyState).toBeTruthy();
  });

  it('titles the page from the navigation namespace', () => {
    render(<InboxPage />);

    expect(screen.getByText('navigation.inbox')).toBeInTheDocument();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  // The rail variant is the folded sidebar form the old Home used. Mounting that
  // here would still render an inbox — just the wrong one — so it is asserted
  // rather than left to the eye.
  it('mounts the full column variant, not the rail form', () => {
    render(<InboxPage />);

    expect(mocks.inboxProps?.variant).toBe('main');
  });

  it('titles the page from the navigation namespace', () => {
    render(<InboxPage />);

    expect(screen.getByText('navigation.inbox')).toBeInTheDocument();
  });
});

/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import AllTopicsDrawer from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/NavPanel/SideBarDrawer', () => ({
  default: ({
    children,
    open,
    subHeader,
  }: {
    children?: ReactNode;
    open: boolean;
    subHeader?: ReactNode;
  }) =>
    open ? (
      <div data-testid="drawer">
        {subHeader}
        {children}
      </div>
    ) : null,
}));

vi.mock('@/libs/next/dynamic', () => ({
  default:
    () =>
    ({ searchKeyword }: { searchKeyword: string }) => (
      <div data-keyword={searchKeyword} data-testid="drawer-content" />
    ),
}));

const getKeyword = () => (screen.getByTestId('drawer-content') as HTMLElement).dataset.keyword;

describe('AllTopicsDrawer search', () => {
  it('applies the keyword only after pressing Enter, not per keystroke', () => {
    render(<AllTopicsDrawer open onClose={() => {}} />);

    const input = screen.getByPlaceholderText('searchPlaceholder');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(getKeyword()).toBe('');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(getKeyword()).toBe('abc');
  });

  it('clears the applied keyword via the clear button', () => {
    render(<AllTopicsDrawer open onClose={() => {}} />);

    const input = screen.getByPlaceholderText('searchPlaceholder');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(getKeyword()).toBe('abc');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(getKeyword()).toBe('');
  });
});

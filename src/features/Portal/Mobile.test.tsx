/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MobilePortal from './Mobile';

const mocks = vi.hoisted(() => ({
  clearPortalStack: vi.fn(),
  showPortal: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
  }),
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      clearPortalStack: mocks.clearPortalStack,
      showPortal: mocks.showPortal,
    }),
}));

vi.mock('@/store/chat/selectors', () => ({
  portalThreadSelectors: { showThread: () => false },
}));

vi.mock('./router', () => ({
  PortalContent: ({ renderBody }: { renderBody?: (body: ReactNode) => ReactNode }) =>
    renderBody ? renderBody(<div data-portal-body />) : <div data-portal-body />,
}));

const sheetContent = () => document.querySelector('[data-slot="sheet-content"]');

const renderPortal = (showPortal: boolean) => {
  mocks.showPortal = showPortal;
  return render(<MobilePortal />);
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.showPortal = false;
});

describe('MobilePortal fullscreen toggle', () => {
  it('opens at 95% height and toggles to the full viewport and back', () => {
    renderPortal(true);

    expect(sheetContent()?.classList.contains('h-[95%]')).toBe(true);
    expect(sheetContent()?.classList.contains('h-dvh')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));

    expect(sheetContent()?.classList.contains('h-dvh')).toBe(true);
    expect(sheetContent()?.classList.contains('h-[95%]')).toBe(false);
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));

    expect(sheetContent()?.classList.contains('h-[95%]')).toBe(true);
  });

  it('reopens at 95% after the store closes the portal externally (no onOpenChange)', () => {
    const { rerender } = renderPortal(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(sheetContent()?.classList.contains('h-dvh')).toBe(true);

    // External close: the store flips showPortal without going through
    // onOpenChange — the sheet unmounts and the fullscreen flag must not
    // survive into the next open.
    mocks.showPortal = false;
    rerender(<MobilePortal />);
    expect(sheetContent()).toBeNull();

    mocks.showPortal = true;
    rerender(<MobilePortal />);

    expect(sheetContent()?.classList.contains('h-[95%]')).toBe(true);
    expect(sheetContent()?.classList.contains('h-dvh')).toBe(false);
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
  });

  it('clears the portal stack when the sheet asks to close (Esc)', () => {
    renderPortal(true);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(mocks.clearPortalStack).toHaveBeenCalled();
  });
});

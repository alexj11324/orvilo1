import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import AcceptancePortalDrawer from './AcceptancePortalDrawer';

/**
 * The drawer and the task workspace column are siblings under `(main)/_layout`,
 * and both render `PortalContent` for an acceptance view, so the drawer has to
 * decide for itself whether this route already has a column.
 *
 * `Drawer` and `PortalContent` are stubbed so the count is exactly the drawer's
 * own open/closed decision rather than the library's rendering.
 */
/**
 * The view type must be the real enum value: `PortalViewType.Acceptance` is
 * `'acceptance'`, lower-case. Writing the literal `'Acceptance'` here made the
 * drawer's predicate false in every case, so the two "renders nothing" tests
 * passed without the code under test ever being consulted — including the one
 * that is supposed to prove non-acceptance views are ignored.
 */
const state = vi.hoisted(() => ({
  viewType: 'acceptance' as string | null,
  /** Whether the matched route declares a persistent portal column. */
  columnHost: false,
  /** Whether that column is expanded. */
  columnExpanded: false,
}));

vi.mock('react-router', () => ({
  useMatches: () =>
    state.columnHost ? [{ handle: { meta: { portalColumn: true } } }] : [{ handle: {} }],
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (selector: (s: unknown) => unknown) => selector({ clearPortalStack: () => {} }),
}));

vi.mock('@/store/chat/selectors', () => ({
  chatPortalSelectors: { currentViewType: () => state.viewType },
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ status: { showTaskAgentPanel: state.columnExpanded } }),
}));

vi.mock('@/features/Portal/router', () => ({
  PortalContent: () => <div data-testid={'portal-content'} />,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Drawer: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid={'drawer'}>{children}</div> : null,
}));

const copies = () => screen.queryAllByTestId('portal-content').length;

const open = (overrides: Partial<typeof state>) => {
  Object.assign(
    state,
    { viewType: PortalViewType.Acceptance, columnHost: false, columnExpanded: false },
    overrides,
  );
  render(<AcceptancePortalDrawer />);
};

afterEach(() => {
  cleanup();
});

describe('AcceptancePortalDrawer hosting', () => {
  it('hosts the acceptance view on a route with no portal column', () => {
    open({});

    expect(copies()).toBe(1);
  });

  // Pairs with the case above: one of the two must render, so this cannot pass
  // by the predicate being dead.
  it('ignores portal views that are not acceptance', () => {
    open({ viewType: PortalViewType.TaskDetail });

    expect(copies()).toBe(0);
  });

  it('stands down when the route has an expanded column, so one view renders once', () => {
    open({ columnExpanded: true, columnHost: true });

    expect(copies()).toBe(0);
  });

  // The regression this guards: `DraggablePanel` keeps its children mounted but
  // sizes them to zero when collapsed, so a collapsed column shows the view
  // *invisibly*. Closing the drawer there would leave the user with nothing.
  it('keeps hosting when the column exists but is collapsed', () => {
    open({ columnExpanded: false, columnHost: true });

    expect(copies()).toBe(1);
  });
});

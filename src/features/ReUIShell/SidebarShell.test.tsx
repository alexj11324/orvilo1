import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { initialState } from '@/store/global/initialState';

import { SidebarShell } from './SidebarShell';

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => viewport.mobile }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/utils/client/switchLang', () => ({ switchLang: vi.fn() }));
vi.mock('./AppSidebar', async () => {
  const { useSidebar } = await import('@/components/ui/sidebar');
  return {
    AppSidebar: () => {
      const { open, openMobile, setOpenMobile } = useSidebar();
      return (
        <>
          <output>Desktop {open ? 'expanded' : 'collapsed'}</output>
          <button onClick={() => setOpenMobile(false)}>
            Drawer {openMobile ? 'open' : 'closed'}
          </button>
        </>
      );
    },
  };
});
const reset = () =>
  useGlobalStore.setState({
    ...initialState,
    isStatusInit: true,
    leftPanelDrawerMode: false,
    leftPanelDrawerOpen: false,
    status: { ...initialState.status },
  });
beforeEach(() => {
  viewport.mobile = false;
  reset();
});
afterEach(reset);

describe('SidebarShell global drawer synchronization', () => {
  it.each([true, false])(
    'returns to desktop preference %s after repeated narrow toggles',
    (desktopOpen) => {
      useGlobalStore.setState({ status: { ...initialState.status, showLeftPanel: desktopOpen } });
      const { rerender, unmount } = render(<SidebarShell />);
      viewport.mobile = true;
      rerender(<SidebarShell />);
      expect(screen.getByRole('button', { name: 'Drawer closed' })).toBeTruthy();
      for (let index = 0; index < 3; index++) {
        act(() => useGlobalStore.getState().toggleLeftPanel());
        fireEvent.click(screen.getByRole('button', { name: 'Drawer open' }));
        expect(useGlobalStore.getState().leftPanelDrawerOpen).toBe(false);
      }
      viewport.mobile = false;
      rerender(<SidebarShell />);
      expect(screen.getByText(`Desktop ${desktopOpen ? 'expanded' : 'collapsed'}`)).toBeTruthy();
      expect(useGlobalStore.getState().status.showLeftPanel).toBe(desktopOpen);
      unmount();
      expect(useGlobalStore.getState().leftPanelDrawerMode).toBe(false);
    },
  );
});

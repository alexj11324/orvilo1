import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { createInitialSystemStatus, initialState } from '@/store/global/initialState';

vi.mock('@/utils/client/switchLang', () => ({ switchLang: vi.fn() }));
const STORAGE_KEY = 'ORVILO_SYSTEM_STATUS';
let saved: string | null;
beforeEach(() => {
  saved = localStorage.getItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  useGlobalStore.setState({
    ...initialState,
    isStatusInit: true,
    leftPanelDrawerMode: false,
    leftPanelDrawerOpen: false,
    status: { ...initialState.status, showLeftPanel: true },
  });
});
afterEach(() => {
  useGlobalStore.setState({
    ...initialState,
    isStatusInit: true,
    leftPanelDrawerMode: false,
    leftPanelDrawerOpen: false,
  });
  if (saved === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, saved);
});

describe('responsive left panel persistence', () => {
  it.each([true, false])(
    'drawer interactions preserve desktop preference %s',
    async (desktopOpen) => {
      useGlobalStore.setState({ status: { ...initialState.status, showLeftPanel: desktopOpen } });
      await useGlobalStore
        .getState()
        .statusStorage.saveToLocalStorage(useGlobalStore.getState().status);
      const persisted = localStorage.getItem(STORAGE_KEY);
      useGlobalStore.getState().setLeftPanelDrawerMode(true);
      expect(useGlobalStore.getState().leftPanelDrawerOpen).toBe(false);
      for (let index = 0; index < 3; index++) {
        useGlobalStore.getState().toggleLeftPanel();
        expect(useGlobalStore.getState().leftPanelDrawerOpen).toBe(true);
        useGlobalStore.getState().toggleLeftPanel(false);
        expect(useGlobalStore.getState().leftPanelDrawerOpen).toBe(false);
      }
      expect(useGlobalStore.getState().status.showLeftPanel).toBe(desktopOpen);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(persisted);
      expect(createInitialSystemStatus().showLeftPanel).toBe(desktopOpen);
      useGlobalStore.getState().toggleLeftPanel(true);
      useGlobalStore.getState().setLeftPanelDrawerMode(false);
      expect(useGlobalStore.getState().leftPanelDrawerOpen).toBe(false);
      expect(useGlobalStore.getState().status.showLeftPanel).toBe(desktopOpen);
    },
  );

  it('persists explicit desktop collapse and expand for the next mount', async () => {
    useGlobalStore.getState().toggleLeftPanel(false);
    await waitFor(() => expect(createInitialSystemStatus().showLeftPanel).toBe(false));
    useGlobalStore.getState().toggleLeftPanel(true);
    await waitFor(() => expect(createInitialSystemStatus().showLeftPanel).toBe(true));
  });
});

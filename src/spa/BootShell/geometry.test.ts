import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useGlobalStore } from '@/store/global';
import { INITIAL_STATUS, type SystemStatus } from '@/store/global/initialState';

import { readBootShellGeometry } from './geometry';

const setStatus = (status: Partial<SystemStatus>) =>
  useGlobalStore.setState({ status: { ...INITIAL_STATUS, ...status } });

beforeEach(() => {
  setStatus({});
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('readBootShellGeometry', () => {
  it('uses App Shell 9 expanded geometry regardless of the old persisted width', () => {
    setStatus({ leftPanelWidth: 320, showLeftPanel: true });

    const geometry = readBootShellGeometry();

    expect(geometry.navPanelWidth).toBe(250);
    expect(geometry.showLeftPanel).toBe(true);
  });

  it('uses the 66px inset rail when the persisted open state is collapsed', () => {
    setStatus({ leftPanelWidth: 9999, showLeftPanel: false });
    expect(readBootShellGeometry().navPanelWidth).toBe(66);
  });

  it('follows the theme already resolved onto the document', () => {
    expect(readBootShellGeometry().isDark).toBe(false);

    document.documentElement.dataset.theme = 'dark';
    expect(readBootShellGeometry().isDark).toBe(true);
  });
});

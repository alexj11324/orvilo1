import { isDesktop } from '@/const/version';
import {
  SHELL9_SIDEBAR_COLLAPSED_WIDTH,
  SHELL9_SIDEBAR_WIDTH,
} from '@/features/ReUIShell/constants';
import { useGlobalStore } from '@/store/global';
import { INITIAL_STATUS } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isMacOS } from '@/utils/platform';

export interface BootShellGeometry {
  isDark: boolean;
  navPanelBackground: string;
  navPanelWidth: number;
  showLeftPanel: boolean;
}

const readIsDark = () => {
  try {
    return document.documentElement.dataset.theme === 'dark';
  } catch {
    return false;
  }
};

const readNavPanelBackground = () =>
  isDesktop && isMacOS() ? 'transparent' : 'var(--color-zinc-900)';

export const readBootShellGeometry = (): BootShellGeometry => {
  const base = {
    isDark: readIsDark(),
    navPanelBackground: readNavPanelBackground(),
  };

  try {
    const state = useGlobalStore.getState();
    const showLeftPanel = Boolean(systemStatusSelectors.showLeftPanel(state));

    return {
      ...base,
      navPanelWidth: showLeftPanel ? SHELL9_SIDEBAR_WIDTH : SHELL9_SIDEBAR_COLLAPSED_WIDTH,
      showLeftPanel,
    };
  } catch {
    const showLeftPanel = Boolean(INITIAL_STATUS.showLeftPanel);
    return {
      ...base,
      navPanelWidth: showLeftPanel ? SHELL9_SIDEBAR_WIDTH : SHELL9_SIDEBAR_COLLAPSED_WIDTH,
      showLeftPanel,
    };
  }
};

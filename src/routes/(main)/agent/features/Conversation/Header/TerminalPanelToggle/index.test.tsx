import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type ActionIcon from '@/components/ActionIcon';

import TerminalPanelToggle from './index';

const mocks = vi.hoisted(() => ({
  showTerminalPanel: false,
  toggleTerminalPanel: vi.fn(),
}));

const actionIconPropsSpy = vi.hoisted(() => vi.fn());

vi.mock('@/components/ActionIcon', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof ActionIcon }>();
  const ActualActionIcon = actual.default;
  return {
    ...actual,
    default: (props: ComponentProps<typeof ActualActionIcon>) => {
      actionIconPropsSpy(props);
      return <ActualActionIcon {...props} />;
    },
  };
});

vi.mock('@/const/version', () => ({ isDesktop: true }));

vi.mock('@/store/global', () => ({
  useGlobalStore: (
    selector: (state: {
      status: { showTerminalPanel: boolean };
      toggleTerminalPanel: () => void;
    }) => unknown,
  ) =>
    selector({
      status: { showTerminalPanel: mocks.showTerminalPanel },
      toggleTerminalPanel: mocks.toggleTerminalPanel,
    }),
}));

vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: {
    showTerminalPanel: (s: { status: { showTerminalPanel: boolean } }) =>
      s.status.showTerminalPanel,
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: object) => unknown) => selector({}),
}));

vi.mock('@/store/user/selectors', () => ({
  settingsSelectors: {
    getHotkeyById: () => () => 'ctrl+backquote',
  },
}));

describe('TerminalPanelToggle', () => {
  beforeEach(() => {
    mocks.showTerminalPanel = false;
    mocks.toggleTerminalPanel.mockReset();
    actionIconPropsSpy.mockClear();
  });

  it('toggles the panel and reflects its active state', () => {
    const { rerender } = render(<TerminalPanelToggle />);

    expect(actionIconPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ active: false }));

    fireEvent.click(screen.getByRole('button'));
    expect(mocks.toggleTerminalPanel).toHaveBeenCalledTimes(1);
    expect(mocks.toggleTerminalPanel).toHaveBeenCalledWith();

    mocks.showTerminalPanel = true;
    actionIconPropsSpy.mockClear();
    rerender(<TerminalPanelToggle key="open" />);

    expect(actionIconPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });
});

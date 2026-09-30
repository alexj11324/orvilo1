import { cx } from 'antd-style';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { memo } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import ToggleLeftPanelButton, { isMacDesktop } from '@/features/NavPanel/ToggleLeftPanelButton';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

export interface NavHeaderProps extends Omit<ComponentProps<'div'>, 'children'> {
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  showTogglePanelButton?: boolean;
  slotClassNames?: {
    center?: string;
    left?: string;
    right?: string;
  };
  styles?: {
    center?: CSSProperties;
    left?: CSSProperties;
    right?: CSSProperties;
  };
}

const NavHeader = memo<NavHeaderProps>(
  ({
    showTogglePanelButton = true,
    style,
    children,
    left,
    right,
    slotClassNames,
    styles,
    ...rest
  }) => {
    const [expand, drawerMode] = useGlobalStore((state) => [
      systemStatusSelectors.showLeftPanel(state),
      state.leftPanelDrawerMode,
    ]);
    const showToggle = showTogglePanelButton && !isMacDesktop && (drawerMode || !expand);
    const noContent = !left && !right && !children;
    if (noContent && !showToggle) return;

    return (
      <div
        className="flex h-[44px] flex-none items-center justify-between gap-1 p-2"
        style={{ minWidth: 0, ...style }}
        {...rest}
      >
        <TooltipProvider>
          <div
            className={cx(slotClassNames?.left, 'flex items-center gap-0.5 justify-start')}
            style={{ minWidth: 0, ...styles?.left }}
          >
            {showToggle && <ToggleLeftPanelButton />}
            {left}
          </div>
          {children && (
            <div
              className={cx(slotClassNames?.center, 'flex flex-col flex-1')}
              style={{ ...styles?.center }}
            >
              {children}
            </div>
          )}
          <div
            className={cx(slotClassNames?.right, 'flex items-center gap-0.5 justify-end')}
            style={{ ...styles?.right }}
          >
            {right}
          </div>
        </TooltipProvider>
      </div>
    );
  },
);

export default NavHeader;

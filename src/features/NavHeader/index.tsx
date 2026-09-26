import { type FlexboxProps } from '@lobehub/ui';
import { Flexbox, TooltipGroup } from '@lobehub/ui';
import { type CSSProperties, type ReactNode } from 'react';
import { memo } from 'react';

export interface NavHeaderProps extends Omit<FlexboxProps, 'children'> {
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
    showTogglePanelButton: _showTogglePanelButton,
    style,
    children,
    left,
    right,
    slotClassNames,
    styles,
    ...rest
  }) => {
    const noContent = !left && !right && !children;
    if (noContent) return;

    return (
      <Flexbox
        allowShrink
        horizontal
        align={'center'}
        flex={'none'}
        gap={4}
        height={44}
        justify={'space-between'}
        padding={8}
        style={style}
        {...rest}
      >
        <TooltipGroup>
          <Flexbox
            allowShrink
            horizontal
            align={'center'}
            className={slotClassNames?.left}
            gap={2}
            justify={'flex-start'}
            style={styles?.left}
          >
            {left}
          </Flexbox>
          {children && (
            <Flexbox className={slotClassNames?.center} flex={1} style={styles?.center}>
              {children}
            </Flexbox>
          )}
          <Flexbox
            horizontal
            align={'center'}
            className={slotClassNames?.right}
            gap={2}
            justify={'flex-end'}
            style={styles?.right}
          >
            {right}
          </Flexbox>
        </TooltipGroup>
      </Flexbox>
    );
  },
);

export default NavHeader;

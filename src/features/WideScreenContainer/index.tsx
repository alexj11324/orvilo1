'use client';

import { clsx as cx } from 'cn';
import isEqual from 'fast-deep-equal';
import { type ComponentProps, type CSSProperties } from 'react';
import { memo, useEffect, useRef } from 'react';

import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

const styles = {
  container: 'transition-[width] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out)',
};

interface WideScreenContainerProps extends ComponentProps<'div'> {
  /**
   * Force the inner column to span the full available width, bypassing the
   * centered `min(CONVERSATION_MIN_WIDTH, 100%)` cap. Used e.g. while
   * multi-selecting so the clickable rows fill the whole stream.
   */
  fullWidth?: boolean;
  minWidth?: number;
  onChange?: () => void;
  wrapperStyle?: CSSProperties;
}

const WideScreenContainer = memo<WideScreenContainerProps>(
  ({
    children,
    className,
    onChange,
    wrapperStyle,
    onClick,
    minWidth,
    fullWidth,
    style,
    ...rest
  }) => {
    const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    // Notify for a layout change; replacing the callback alone is not a layout change.
    useEffect(() => {
      onChangeRef.current?.();
    }, [wideScreen]);

    return (
      <div className="flex flex-col w-full" style={{ ...wrapperStyle }} onClick={onClick}>
        <div
          className={cx(cx('grow self-center', styles.container, className), 'flex flex-col')}
          data-slot={'wide-screen-container'}
          style={{
            paddingInline: fullWidth ? 0 : 16,
            width:
              fullWidth || wideScreen
                ? '100%'
                : `min(${minWidth || CONVERSATION_MIN_WIDTH}px, 100%)`,
            ...style,
          }}
          {...rest}
        >
          {children}
        </div>
      </div>
    );
  },
  isEqual,
);

export default WideScreenContainer;

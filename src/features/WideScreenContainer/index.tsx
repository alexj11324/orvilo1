'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { type ComponentProps, type CSSProperties } from 'react';
import { memo, useEffect } from 'react';

import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    flex-grow: 1;
    align-self: center;
    transition: width 0.25s ${cssVar.motionEaseInOut};
  `,
}));

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
  ({ children, className, onChange, wrapperStyle, onClick, minWidth, fullWidth, ...rest }) => {
    const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);

    useEffect(() => {
      onChange?.();
    }, [wideScreen]);

    return (
      <div className="flex flex-col w-full" style={{ ...wrapperStyle }} onClick={onClick}>
        <div
          className={cx(cx(styles.container, className), 'flex flex-col')}
          style={{
            paddingInline: fullWidth ? 0 : 16,
            width:
              fullWidth || wideScreen
                ? '100%'
                : `min(${minWidth || CONVERSATION_MIN_WIDTH}px, 100%)`,
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

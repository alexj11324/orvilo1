'use client';

import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import type { CSSProperties, HTMLAttributes } from 'react';

import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    flex-grow: 1;
    align-self: center;
  `,
}));

const ConversationSkeletonContainer = ({
  children,
  className,
  flex,
  height,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  flex?: CSSProperties['flex'];
  height?: CSSProperties['height'];
}) => {
  const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);

  return (
    <div
      aria-busy
      className={'flex flex-col'}
      style={{ flex, height, minHeight: 0, width: '100%' }}
    >
      <div
        className={cn('flex px-4', cx(styles.container, className))}
        style={{
          flex,
          height,
          width: wideScreen ? '100%' : `min(${CONVERSATION_MIN_WIDTH}px, 100%)`,
        }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
};

export default ConversationSkeletonContainer;

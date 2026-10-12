'use client';

import { clsx as cx, cn } from 'cn';
import type { CSSProperties, HTMLAttributes } from 'react';

import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

const styles = {
  container: 'grow self-center',
};

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
    <div aria-busy className={'flex min-h-0 w-full flex-col'} style={{ flex, height }}>
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

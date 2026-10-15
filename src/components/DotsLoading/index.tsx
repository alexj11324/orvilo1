'use client';

import { clsx as cx } from 'cn';
import { type CSSProperties, memo } from 'react';
import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const styles = {
  container: 'inline-flex flex-row items-center gap-(--dots-loading-gap)',
  dot: 'size-(--dots-loading-size) rounded-full bg-(--dots-loading-color) motion-reduce:animate-none',
};

interface StyleArgs {
  color?: string;
  gap?: number;
  size?: number;
}

interface DotsLoadingProps extends StyleArgs {
  className?: string;
  style?: CSSProperties;
}

const DotsLoading = memo<DotsLoadingProps>(({ size = 4, gap = 3, color, className, style }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const shouldAnimate = animationMode !== 'disabled' && !prefersReducedMotion;

  const cssVars = {
    '--dots-loading-color': color || 'var(--muted-foreground)',
    '--dots-loading-gap': `${gap}px`,
    '--dots-loading-size': `${size}px`,
  } as CSSProperties;

  return (
    <div className={cx(styles.container, className)} style={{ ...cssVars, ...style }}>
      <div className={cx(styles.dot, shouldAnimate && 'animate-dots-loading-fade')} />
      <div
        className={cx(
          styles.dot,
          '[animation-delay:150ms]',
          shouldAnimate && 'animate-dots-loading-fade',
        )}
      />
      <div
        className={cx(
          styles.dot,
          '[animation-delay:300ms]',
          shouldAnimate && 'animate-dots-loading-fade',
        )}
      />
    </div>
  );
});

export default DotsLoading;

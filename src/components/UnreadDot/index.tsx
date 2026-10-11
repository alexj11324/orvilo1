'use client';

import { cn } from 'cn';
import { memo } from 'react';
import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

const styles = {
  dot: 'relative z-1 size-1.5 rounded-full bg-info',
  ripple:
    'absolute inset-0 m-auto size-1.5 rounded-full border border-info bg-transparent motion-reduce:animate-none',
  wrapper: 'relative flex size-3.5 flex-none items-center justify-center',
};

interface UnreadDotProps {
  /** Announces the mark to screen readers — pass it wherever the dot is the only carrier of "unread". */
  label?: string;
}

/**
 * The unread mark for a completed run the user hasn't opened: a live rippling
 * dot rather than a static glyph, so "there's something new here" reads at a
 * glance in a long list. `ExecutionStatus`'s `unread` icon is only the fallback
 * for surfaces that can't render this.
 */
const UnreadDot = memo<UnreadDotProps>(({ label }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const shouldAnimate = animationMode !== 'disabled' && !prefersReducedMotion;

  return (
    <span
      aria-label={label}
      className={styles.wrapper}
      data-testid="topic-unread-dot"
      role={label ? 'status' : undefined}
    >
      <span className={cn(styles.ripple, shouldAnimate && 'animate-unread-ripple')} />
      <span className={styles.dot} />
    </span>
  );
});

export default UnreadDot;

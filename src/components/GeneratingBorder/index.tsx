'use client';

import { cn } from 'cn';
import { memo, type ReactNode } from 'react';
import { useMediaQuery } from 'react-responsive';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import styles from './index.module.css';

export interface GeneratingBorderProps {
  children?: ReactNode;
  className?: string;
  /** Lights the ring. Resting state renders the children untouched. */
  generating?: boolean;
  style?: React.CSSProperties;
}

/** One shared ongoing-generation indicator; caller state still owns its lifetime. */
const GeneratingBorder = memo<GeneratingBorderProps>(
  ({ children, className, generating, style }) => {
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const shouldAnimate = animationMode !== 'disabled' && !prefersReducedMotion;

    return (
      <div
        style={{ ...style }}
        className={cn(
          'flex flex-col',
          [
            styles.shell,
            generating && styles.shellGenerating,
            generating && !shouldAnimate && styles.shellMotionStopped,
            className,
          ]
            .filter(Boolean)
            .join(' '),
        )}
      >
        {children}
      </div>
    );
  },
);

export default GeneratingBorder;

import { cn } from 'cn';
import type { ComponentProps, CSSProperties } from 'react';

import styles from './markdown.module.css';

/** The fade extent is a percentage of content, matching the existing preview contract. */
export function MaskShadow({
  position = 'bottom',
  size = 40,
  className,
  style,
  ...props
}: ComponentProps<'div'> & { position?: 'top' | 'bottom' | 'left' | 'right'; size?: number }) {
  const angle = { top: '0deg', bottom: '180deg', left: '270deg', right: '90deg' }[position];
  return (
    <div
      {...props}
      className={cn(styles.mask, 'relative flex flex-col overflow-hidden', className)}
      style={
        {
          '--markdown-mask-angle': angle,
          '--markdown-mask-extent': `${size}%`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
export default MaskShadow;

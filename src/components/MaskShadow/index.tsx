import { cn } from 'cn';
import type { CSSProperties, HTMLAttributes } from 'react';

export interface MaskShadowProps extends HTMLAttributes<HTMLDivElement> {
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: number;
  visibility?: 'auto' | 'always' | 'never';
}
const MASKS = {
  bottom: 'mask-[linear-gradient(180deg,black_calc(100%_-_var(--mask-shadow-size)),transparent)]',
  left: 'mask-[linear-gradient(270deg,black_calc(100%_-_var(--mask-shadow-size)),transparent)]',
  right: 'mask-[linear-gradient(90deg,black_calc(100%_-_var(--mask-shadow-size)),transparent)]',
  top: 'mask-[linear-gradient(0deg,black_calc(100%_-_var(--mask-shadow-size)),transparent)]',
};
/** Alpha mask, not a surface color: black denotes full opacity in CSS masking. */
export function MaskShadow({
  children,
  className,
  position = 'bottom',
  size = 40,
  style,
  visibility = 'always',
  ...rest
}: MaskShadowProps) {
  return (
    <div
      {...rest}
      style={{ '--mask-shadow-size': `${size}%`, ...style } as CSSProperties}
      className={cn(
        'relative overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        visibility !== 'never' && MASKS[position],
        className,
      )}
    >
      {children}
    </div>
  );
}

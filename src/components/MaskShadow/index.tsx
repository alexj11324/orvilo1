import { cn } from 'cn';
import { type ComponentProps, type CSSProperties, memo } from 'react';

interface MaskShadowProps extends ComponentProps<'div'> {
  /** Share of the height, in percent, that fades out at the bottom edge. */
  size?: number;
}

/**
 * Clips its content and fades the bottom edge to transparent. The mask uses
 * black only as an alpha source; it is not a rendered color.
 */
const MaskShadow = memo<MaskShadowProps>(({ className, size, style, ...rest }) => (
  <div
    className={cn(
      'relative flex flex-col overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      'mask-[linear-gradient(180deg,#000_calc(100%_-_var(--mask-shadow-size,40%)),transparent)]',
      className,
    )}
    style={
      size === undefined ? style : ({ '--mask-shadow-size': `${size}%`, ...style } as CSSProperties)
    }
    {...rest}
  />
));

MaskShadow.displayName = 'MaskShadow';

export default MaskShadow;

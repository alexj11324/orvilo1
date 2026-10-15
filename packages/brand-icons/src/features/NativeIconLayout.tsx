import type { CSSProperties, HTMLAttributes } from 'react';

export interface NativeIconLayoutProps extends HTMLAttributes<HTMLDivElement> {
  align?: CSSProperties['alignItems'];
  flex?: CSSProperties['flex'];
  gap?: number;
  height?: CSSProperties['height'];
  horizontal?: boolean;
  justify?: CSSProperties['justifyContent'];
  width?: CSSProperties['width'];
}
/** Dedicated vector-mark composition; all dimensions are caller/brand calculations. */
export const NativeIconLayout = ({
  align,
  flex,
  gap,
  height,
  horizontal = true,
  justify,
  width,
  style,
  className,
  ...props
}: NativeIconLayoutProps) => (
  <div
    {...props}
    className={`flex ${horizontal ? 'flex-row' : 'flex-col'} ${className ?? ''}`}
    style={{ alignItems: align, flex, gap, height, justifyContent: justify, width, ...style }}
  />
);
export const NativeIconDivider = ({
  type: _type,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { type?: 'vertical' }) => (
  <span
    {...props}
    aria-hidden
    className="inline-block h-[0.9em] shrink-0 border-s border-divider align-middle"
    style={style}
  />
);

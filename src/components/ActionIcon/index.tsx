'use client';

import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import { type CSSProperties, isValidElement, memo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ActionIconSizeType = 'small' | 'middle' | 'large';

interface ActionIconSizeConfig {
  blockSize?: number | string;
  borderRadius?: number | string;
  size?: number;
  strokeWidth?: number;
}

type ActionIconSize = number | ActionIconSizeType | ActionIconSizeConfig;

type ActionIconVariant = 'borderless' | 'filled' | 'outlined';

type ActionIconOutdent = boolean | 'start' | 'end';

interface ActionIconClassNames {
  icon?: string;
  root?: string;
}

interface ActionIconStyles {
  icon?: CSSProperties;
  root?: CSSProperties;
}

type TooltipPlacement =
  | 'top'
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight'
  | 'left'
  | 'leftTop'
  | 'leftBottom'
  | 'right'
  | 'rightTop'
  | 'rightBottom';

interface ActionIconTooltipProps {
  [key: string]: unknown;
  placement?: TooltipPlacement;
}

const NAMED_SIZE: Record<
  ActionIconSizeType,
  { blockSize: number; borderRadius: number; iconSize: number; outdent: number }
> = {
  large: { blockSize: 44, borderRadius: 8, iconSize: 24, outdent: 10 },
  middle: { blockSize: 36, borderRadius: 6, iconSize: 20, outdent: 8 },
  small: { blockSize: 24, borderRadius: 4, iconSize: 14, outdent: 5 },
};

const toCss = (value: number | string): string =>
  typeof value === 'number' ? `${value}px` : value;

function calcSize(iconSize: ActionIconSize | undefined): {
  blockSize: number | string;
  borderRadius: number | string;
  iconSize: number;
  strokeWidth: number;
} {
  if (typeof iconSize === 'number') {
    const blockSize = iconSize * 1.8;
    return { blockSize, borderRadius: Math.floor(blockSize / 6), iconSize, strokeWidth: 2 };
  }
  if (iconSize === 'small' || iconSize === 'middle' || iconSize === 'large') {
    const { blockSize, borderRadius, iconSize: glyph } = NAMED_SIZE[iconSize];
    return { blockSize, borderRadius, iconSize: glyph, strokeWidth: 2 };
  }
  if (iconSize) {
    return {
      blockSize: iconSize.blockSize ?? 36,
      borderRadius: iconSize.borderRadius ?? 6,
      iconSize: iconSize.size ?? 24,
      strokeWidth: iconSize.strokeWidth ?? 2,
    };
  }
  return { blockSize: '1.8em', borderRadius: '0.3em', iconSize: 24, strokeWidth: 2 };
}

function calcOutdent(iconSize: ActionIconSize | undefined): string {
  if (typeof iconSize === 'number') return `${iconSize * 0.4}px`;
  if (iconSize === 'small' || iconSize === 'middle' || iconSize === 'large') {
    return `${NAMED_SIZE[iconSize].outdent}px`;
  }
  if (iconSize) {
    const { blockSize, iconSize: glyph } = calcSize(iconSize);
    if (typeof blockSize === 'number') return `${Math.max(0, (blockSize - glyph) / 2)}px`;
    return `calc((${toCss(blockSize)} - ${toCss(glyph)}) / 2)`;
  }
  return '0.4em';
}

const PLACEMENT_MAP: Record<
  TooltipPlacement,
  { align?: 'start' | 'center' | 'end'; side: 'top' | 'bottom' | 'left' | 'right' }
> = {
  bottom: { align: 'center', side: 'bottom' },
  bottomCenter: { align: 'center', side: 'bottom' },
  bottomLeft: { align: 'start', side: 'bottom' },
  bottomRight: { align: 'end', side: 'bottom' },
  left: { align: 'center', side: 'left' },
  leftBottom: { align: 'end', side: 'left' },
  leftTop: { align: 'start', side: 'left' },
  right: { align: 'center', side: 'right' },
  rightBottom: { align: 'end', side: 'right' },
  rightTop: { align: 'start', side: 'right' },
  top: { align: 'center', side: 'top' },
  topCenter: { align: 'center', side: 'top' },
  topLeft: { align: 'start', side: 'top' },
  topRight: { align: 'end', side: 'top' },
};

const VARIANT_MAP: Record<ActionIconVariant, 'ghost' | 'secondary' | 'outline'> = {
  borderless: 'ghost',
  filled: 'secondary',
  outlined: 'outline',
};

interface ActionIconOwnProps {
  /** Muted-but-selected visual state. */
  active?: boolean;
  classNames?: ActionIconClassNames;
  /** Icon color passed through to the lucide glyph. */
  color?: string;
  /** Danger hover colors. */
  danger?: boolean;
  disabled?: boolean;
  /** lucide `fill` passthrough. */
  fill?: string;
  fillOpacity?: number | string;
  fillRule?: 'inherit' | 'evenodd' | 'nonzero';
  /** Rendered glyph: a lucide icon component or an arbitrary node. */
  icon?: LucideIcon | ReactNode;
  /** Swap the glyph for a spinner and disable the button. */
  loading?: boolean;
  /**
   * Cancels the borderless icon inset (half of block − glyph) with a negative
   * margin so the icon lines up with adjacent copy. Only valid on `borderless`.
   */
  outdent?: ActionIconOutdent;
  size?: ActionIconSize;
  /** `animate-spin` on the glyph. */
  spin?: boolean;
  styles?: ActionIconStyles;
  /** Tooltip content; a string also feeds `aria-label` when none is set. */
  title?: ReactNode;
  tooltipProps?: ActionIconTooltipProps;
  variant?: ActionIconVariant;
}

type ActionIconProps = ActionIconOwnProps &
  Omit<React.ComponentProps<'button'>, 'color' | 'title' | 'children'>;

/**
 * Icon-only action button matching the lobehub `ActionIcon` API and sizing.
 * Built on `ui/button` + `ui/tooltip`; `title` wraps the button in a tooltip.
 */
const ActionIcon = memo<ActionIconProps>(
  ({
    active,
    'aria-label': ariaLabel,
    className,
    classNames,
    color,
    danger,
    disabled,
    fill,
    fillOpacity,
    fillRule,
    icon,
    loading,
    outdent,
    size = 'middle',
    spin,
    style,
    'styles': slotStyles,
    title,
    tooltipProps,
    type,
    variant = 'borderless',
    ...rest
  }) => {
    const { blockSize, borderRadius, iconSize, strokeWidth } = calcSize(size);

    const iconNode = loading ? (
      <Spinner className={cn('pointer-events-none', classNames?.icon)} style={slotStyles?.icon} />
    ) : icon ? (
      isValidElement(icon) ? (
        icon
      ) : (
        (() => {
          const Glyph = icon as LucideIcon;
          return (
            <Glyph
              className={cn('pointer-events-none', spin && 'animate-spin', classNames?.icon)}
              color={color}
              fill={fill ?? 'transparent'}
              fillOpacity={fillOpacity}
              fillRule={fillRule}
              size={iconSize}
              strokeWidth={strokeWidth}
              style={slotStyles?.icon}
            />
          );
        })()
      )
    ) : undefined;

    const outdentAmount = variant === 'borderless' && outdent ? calcOutdent(size) : undefined;
    const outdentMargin: CSSProperties | undefined = outdentAmount
      ? outdent === 'end'
        ? { marginInlineEnd: `-${outdentAmount}` }
        : { marginInlineStart: `-${outdentAmount}` }
      : undefined;

    const { placement, ...restTooltipProps } = tooltipProps ?? {};
    const positioner = placement ? PLACEMENT_MAP[placement] : undefined;

    const node = (
      <Button
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        data-active={active || undefined}
        disabled={disabled || loading}
        type={type ?? 'button'}
        variant={VARIANT_MAP[variant]}
        className={cn(
          'text-muted-foreground hover:text-foreground active:text-foreground',
          danger && 'text-muted-foreground hover:text-destructive active:text-destructive',
          active && 'bg-muted text-foreground',
          classNames?.root,
          className,
        )}
        style={{
          ...outdentMargin,
          borderRadius: toCss(borderRadius),
          height: blockSize,
          width: blockSize,
          ...slotStyles?.root,
          ...style,
        }}
        {...rest}
      >
        {iconNode}
      </Button>
    );

    if (!title) return node;

    return (
      <Tooltip>
        <TooltipTrigger render={node} />
        <TooltipContent
          align={positioner?.align}
          side={positioner?.side}
          {...(restTooltipProps as object)}
        >
          {title}
        </TooltipContent>
      </Tooltip>
    );
  },
);
ActionIcon.displayName = 'ActionIcon';

export default ActionIcon;
export {
  type ActionIconClassNames,
  type ActionIconOutdent,
  type ActionIconProps,
  type ActionIconSize,
  type ActionIconStyles,
  type ActionIconVariant,
};

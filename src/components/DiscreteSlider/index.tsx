'use client';

import { clsx as cx, cn } from 'cn';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { memo, useMemo } from 'react';

import { useFormControlContext } from '@/components/FormControlContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { findClosestOptionIndex } from './utils';

const styles = {
  label:
    'h-auto min-h-7 min-w-6 cursor-pointer rounded-(--radius-input) border-0 bg-transparent p-0 text-center text-sm font-normal leading-5.5 whitespace-normal [overflow-wrap:anywhere] transition-colors duration-(--orvilo-motion-mid) ease-[ease] hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-0 disabled:cursor-not-allowed motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 [&_svg]:pointer-events-auto [&_svg]:shrink [&_svg:not([class*="size-"])]:size-auto',
  labels: 'grid w-full gap-2',
  root: 'w-full',
  selectedLabel: 'text-foreground',
  slider: 'w-full px-1.5',
};

export interface DiscreteSliderOption {
  ariaLabel?: string;
  label: ReactNode;
  style?: CSSProperties;
  value: number;
}

export interface DiscreteSliderProps extends Omit<
  ComponentProps<typeof Slider>,
  | 'className'
  | 'defaultValue'
  | 'max'
  | 'min'
  | 'onChange'
  | 'onValueChange'
  | 'onValueCommitted'
  | 'step'
  | 'style'
  | 'value'
> {
  className?: string;
  formatTooltip?: (value: number) => ReactNode;
  onChange?: (value: number) => void;
  onChangeComplete?: (value: number) => void;
  options: readonly DiscreteSliderOption[];
  style?: CSSProperties;
  value: number;
}

const DiscreteSlider = memo<DiscreteSliderProps>(
  ({
    className,
    disabled,
    formatTooltip,
    onChange,
    onChangeComplete,
    options,
    style,
    value,
    ...rest
  }) => {
    const formControl = useFormControlContext();
    const resolvedDisabled = disabled ?? formControl.disabled;
    const currentIndex = useMemo(() => findClosestOptionIndex(options, value), [options, value]);
    const currentOption = options[currentIndex];
    const gridTemplateColumns =
      options.length > 1
        ? [
            'minmax(0, 0.5fr)',
            ...Array.from({ length: options.length - 2 }).fill('minmax(0, 1fr)'),
            'minmax(0, 0.5fr)',
          ].join(' ')
        : 'minmax(0, 1fr)';

    const slider = (
      <div className={styles.slider}>
        <Slider
          {...rest}
          disabled={resolvedDisabled || options.length === 0}
          max={Math.max(0, options.length - 1)}
          min={0}
          step={1}
          value={currentIndex}
          onValueChange={(index) => {
            const option = options[typeof index === 'number' ? index : index[0]];
            if (option) onChange?.(option.value);
          }}
          onValueCommitted={(index) => {
            const option = options[typeof index === 'number' ? index : index[0]];
            if (option) onChangeComplete?.(option.value);
          }}
        />
      </div>
    );

    return (
      <div className={cx('flex flex-col gap-1.5', styles.root, className)} style={style}>
        {formatTooltip && currentOption ? (
          <Tooltip>
            <TooltipTrigger render={slider} />
            <TooltipContent>{formatTooltip(currentOption.value)}</TooltipContent>
          </Tooltip>
        ) : (
          slider
        )}
        <div className={styles.labels} style={{ gridTemplateColumns }}>
          {options.map((option, index) => {
            const isFirst = index === 0;
            const isLast = index === options.length - 1;
            const textAlign = isFirst === isLast ? 'center' : isFirst ? 'start' : 'end';

            return (
              <Button
                aria-current={index === currentIndex ? 'true' : undefined}
                aria-label={option.ariaLabel}
                disabled={resolvedDisabled}
                key={option.value}
                size="sm"
                style={{ textAlign, ...option.style }}
                type={'button'}
                variant="ghost"
                className={cn(
                  styles.label,
                  index === currentIndex ? styles.selectedLabel : 'text-muted-foreground',
                )}
                onClick={() => onChange?.(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  },
);

DiscreteSlider.displayName = 'DiscreteSlider';

export default DiscreteSlider;

'use client';

import { cn } from 'cn';
import { createElement, type ElementType, memo, type ReactNode } from 'react';

export interface ImageSelectOption<Value extends string = string> {
  alt?: string;
  icon?: ElementType;
  img: string;
  label: ReactNode;
  value: Value;
}

export interface ImageSelectProps<Value extends string = string> {
  className?: string;
  /** Preview image height in px. */
  height?: number;
  onChange?: (value: Value) => void;
  options: ImageSelectOption<Value>[];
  value?: Value;
  /** Preview image width in px. */
  width?: number;
}

/** A row of image previews where clicking one selects its value (e.g. theme mode). */
const ImageSelect = <Value extends string = string>({
  className,
  height = 86,
  onChange,
  options,
  value,
  width = 144,
}: ImageSelectProps<Value>) => (
  <div className={cn('flex gap-4', className)} role="radiogroup">
    {options.map((option) => {
      const active = option.value === value;

      return (
        <button
          aria-checked={active}
          key={option.value}
          role="radio"
          type="button"
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-(--radius-card) border-0 bg-transparent p-0 text-sm text-foreground-description outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            active && 'text-foreground',
          )}
          onClick={() => onChange?.(option.value)}
        >
          <img
            alt={option.alt || option.value}
            height={height}
            src={option.img}
            style={{ height, width }}
            width={width}
            className={cn(
              'rounded-(--radius-card) bg-accent hover:ring-2 hover:ring-foreground',
              active && 'ring-2 ring-foreground-tertiary',
            )}
          />
          <span className="flex items-center gap-1">
            {option.icon && createElement(option.icon, { className: 'size-4' })}
            {option.label}
          </span>
        </button>
      );
    })}
  </div>
);

export default memo(ImageSelect) as typeof ImageSelect;

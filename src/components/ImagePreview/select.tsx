'use client';

import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import NextImage from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface ImageSelectItem {
  alt?: string;
  icon?: LucideIcon;
  img: string;
  label: ReactNode;
  value: string;
}
export interface ImageSelectProps {
  className?: string;
  classNames?: { img?: string };
  defaultValue?: string;
  height?: number;
  onChange?: (value: string) => void;
  options?: ImageSelectItem[];
  style?: CSSProperties;
  styles?: { img?: CSSProperties };
  unoptimized?: boolean;
  value?: string;
  width?: number;
}

/** Use the same Next image optimizer contract; Electron callers keep unoptimized. */
export function ImageSelect({
  className,
  classNames,
  defaultValue,
  height = 86,
  onChange,
  options = [],
  style,
  styles,
  unoptimized,
  value,
  width = 144,
}: ImageSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  return (
    <RadioGroup
      className={cn('flex flex-row flex-wrap gap-4', className)}
      style={style}
      value={value ?? internalValue ?? null}
      onValueChange={(selected) => {
        setInternalValue(selected);
        onChange?.(selected);
      }}
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <label
            className="group/image-option relative flex cursor-pointer flex-col items-center gap-1 text-sm text-muted-foreground has-data-checked:text-primary-text"
            key={option.value}
          >
            <RadioGroupItem className="sr-only" value={option.value} />
            <NextImage
              alt={option.alt ?? option.value}
              height={height}
              src={option.img}
              style={{ ...styles?.img, height, width }}
              unoptimized={unoptimized}
              width={width}
              className={cn(
                'rounded-(--radius-card) border border-divider ring-offset-background group-has-[:focus-visible]/image-option:ring-2 group-has-[:focus-visible]/image-option:ring-ring group-has-data-checked/image-option:border-primary group-has-data-checked/image-option:ring-2 group-has-data-checked/image-option:ring-primary',
                classNames?.img,
              )}
            />
            <span className="flex items-center gap-1">
              {Icon && <Icon aria-hidden className="size-4" />}
              {option.label}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

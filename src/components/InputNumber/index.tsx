'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ComponentProps, type CSSProperties, memo, type ReactNode } from 'react';

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field';

/**
 * Drop-in for the lobehub/antd `InputNumber` usages in this codebase: a single
 * bordered field (optional leading `prefix` and stepper buttons) bound to a
 * nullable number.
 */
export interface InputNumberProps {
  'aria-label'?: string;
  'className'?: string;
  /** Show the numeric stepper controls; enabled by default. */
  'controls'?: boolean;
  'disabled'?: boolean;
  'max'?: number;
  'min'?: number;
  'onChange'?: (value: number | null) => void;
  'placeholder'?: string;
  'prefix'?: ReactNode;
  'size'?: ComponentProps<typeof NumberField>['size'];
  'step'?: number;
  'style'?: CSSProperties;
  'value'?: number | null;
}

const InputNumber = memo<InputNumberProps>(
  ({
    'aria-label': ariaLabel,
    className,
    controls = true,
    disabled,
    max,
    min,
    onChange,
    placeholder,
    prefix,
    size,
    step,
    style,
    value,
  }) => (
    <NumberField
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      max={max}
      min={min}
      size={size}
      step={step}
      style={style}
      value={value}
      onValueChange={(next) => onChange?.(next)}
    >
      <NumberFieldGroup className={controls ? 'gap-1 ps-2 pe-0 pointer-coarse:pe-2' : 'gap-1 px-2'}>
        {prefix}
        <NumberFieldInput className={controls ? 'px-0' : undefined} placeholder={placeholder} />
        {controls && (
          <div className="grid h-full w-5 shrink-0 grid-rows-2 border-s border-input pointer-coarse:hidden">
            <NumberFieldIncrement className="rounded-none rounded-se-(--radius-input) px-0 text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent">
              <ChevronUp className="size-3" />
            </NumberFieldIncrement>
            <NumberFieldDecrement className="rounded-none rounded-ee-(--radius-input) px-0 text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent">
              <ChevronDown className="size-3" />
            </NumberFieldDecrement>
          </div>
        )}
      </NumberFieldGroup>
      {controls && (
        // 40px controls with an 8px gap keep the shared 44px touch targets separate.
        <div className="hidden w-full items-center justify-center gap-2 pointer-coarse:flex">
          <NumberFieldDecrement className="size-10 rounded-(--radius-input) border border-input text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent">
            <ChevronDown className="size-4" />
          </NumberFieldDecrement>
          <NumberFieldIncrement className="size-10 rounded-(--radius-input) border border-input text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent">
            <ChevronUp className="size-4" />
          </NumberFieldIncrement>
        </div>
      )}
    </NumberField>
  ),
);

InputNumber.displayName = 'InputNumber';

export default InputNumber;

'use client';

import { type CSSProperties, memo, type ReactNode } from 'react';

import { NumberField, NumberFieldGroup, NumberFieldInput } from '@/components/reui/number-field';

/**
 * Drop-in for the lobehub/antd `InputNumber` usages in this codebase: a single
 * bordered field (optional leading `prefix` and stepper buttons) bound to a
 * nullable number.
 */
export interface InputNumberProps {
  'aria-label'?: string;
  'className'?: string;
  /** antd-only prop kept for API parity; steppers are always rendered. */
  'controls'?: boolean;
  'disabled'?: boolean;
  'max'?: number;
  'min'?: number;
  'onChange'?: (value: number | null) => void;
  'placeholder'?: string;
  'prefix'?: ReactNode;
  'step'?: number;
  'style'?: CSSProperties;
  'value'?: number | null;
}

const InputNumber = memo<InputNumberProps>(
  ({
    'aria-label': ariaLabel,
    className,
    disabled,
    max,
    min,
    onChange,
    placeholder,
    prefix,
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
      step={step}
      style={style}
      value={value}
      onValueChange={(next) => onChange?.(next)}
    >
      <NumberFieldGroup className="gap-1 px-2">
        {prefix}
        <NumberFieldInput placeholder={placeholder} />
      </NumberFieldGroup>
    </NumberField>
  ),
);

InputNumber.displayName = 'InputNumber';

export default InputNumber;

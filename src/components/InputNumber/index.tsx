'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ComponentProps, type CSSProperties, memo, type ReactNode, useRef } from 'react';

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
  /** Enable focused wheel adjustment using the NumberField's native wheel handling. */
  'changeOnWheel'?: boolean;
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

function NumberFieldStepper({
  direction,
  onClick,
  onPointerCancel,
  onPointerDown,
  ...props
}: ComponentProps<typeof NumberFieldIncrement> & { direction: 'decrement' | 'increment' }) {
  const rejectedTouch = useRef(false);
  const Stepper = direction === 'increment' ? NumberFieldIncrement : NumberFieldDecrement;

  return (
    <Stepper
      {...props}
      onClick={(event) => {
        const reject = rejectedTouch.current && event.detail !== 0;
        rejectedTouch.current = false;
        if (reject) event.preventBaseUIHandler();
        onClick?.(event);
      }}
      onPointerCancel={(event) => {
        rejectedTouch.current = false;
        onPointerCancel?.(event);
      }}
      onPointerDown={(event) => {
        rejectedTouch.current = false;
        if (event.pointerType === 'touch') {
          // Touch adjustment can target a button from the gap and move click coordinates.
          // Hit testing the original point also accepts the shared 44px extension.
          const hit = event.currentTarget.ownerDocument.elementFromPoint(
            event.clientX,
            event.clientY,
          );
          rejectedTouch.current = !hit || !event.currentTarget.contains(hit);
          if (rejectedTouch.current) event.preventBaseUIHandler();
        }
        onPointerDown?.(event);
      }}
    />
  );
}

const InputNumber = memo<InputNumberProps>(
  ({
    'aria-label': ariaLabel,
    changeOnWheel,
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
      allowWheelScrub={changeOnWheel}
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
        <NumberFieldInput
          aria-label={ariaLabel}
          className={controls ? 'px-0' : undefined}
          placeholder={placeholder}
        />
        {controls && (
          <div className="grid h-full w-5 shrink-0 grid-rows-2 border-s border-input pointer-coarse:hidden">
            <NumberFieldStepper
              className="rounded-none rounded-se-(--radius-input) px-0 text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
              direction="increment"
            >
              <ChevronUp />
            </NumberFieldStepper>
            <NumberFieldStepper
              className="rounded-none rounded-ee-(--radius-input) px-0 text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
              direction="decrement"
            >
              <ChevronDown />
            </NumberFieldStepper>
          </div>
        )}
      </NumberFieldGroup>
      {controls && (
        // 40px controls with an 8px gap keep the shared 44px touch targets separate.
        <div className="hidden w-full items-center justify-center gap-2 pointer-coarse:flex">
          <NumberFieldStepper
            className="size-10 rounded-(--radius-input) border border-input text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
            direction="decrement"
          >
            <ChevronDown className="size-4" />
          </NumberFieldStepper>
          <NumberFieldStepper
            className="size-10 rounded-(--radius-input) border border-input text-muted-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent"
            direction="increment"
          >
            <ChevronUp className="size-4" />
          </NumberFieldStepper>
        </div>
      )}
    </NumberField>
  ),
);

InputNumber.displayName = 'InputNumber';

export default InputNumber;

'use client';

import type { ComponentProps } from 'react';
import { memo, useEffect, useState } from 'react';

import InputNumber from '@/components/InputNumber';
import { Slider } from '@/components/ui/slider';

interface FormSliderWithInputProps extends Omit<
  ComponentProps<typeof Slider>,
  'onValueChange' | 'value'
> {
  onChange?: (value: number) => void;
  value?: number;
}

/**
 * Form-integrated slider with delayed onChange behavior.
 * Only triggers onChange on blur to prevent excessive updates during user interaction.
 */
const FormSliderWithInput = memo<FormSliderWithInputProps>(
  ({ onChange, value: defaultValue, ...props }) => {
    const [value, setValue] = useState(defaultValue ?? 0);

    useEffect(() => {
      setValue(defaultValue ?? 0);
    }, [defaultValue]);

    return (
      <div className="flex items-center gap-3">
        <Slider
          {...props}
          className="flex-1"
          value={value}
          onValueChange={(newValue) => {
            if (typeof newValue === 'number') {
              setValue(newValue);
            }
          }}
          onValueCommitted={(newValue) => {
            if (typeof newValue === 'number') {
              onChange?.(newValue);
            }
          }}
        />
        <InputNumber
          disabled={props.disabled}
          max={props.max}
          min={props.min}
          step={props.step}
          value={value}
          onBlur={() => {
            onChange?.(value);
          }}
          onChange={(newValue) => {
            if (typeof newValue === 'number') {
              setValue(newValue);
            }
          }}
        />
      </div>
    );
  },
);

FormSliderWithInput.displayName = 'FormSliderWithInput';

export default FormSliderWithInput;

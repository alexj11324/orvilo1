import { memo, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';

interface FormInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'type'> {
  onChange?: (value: string) => void;
  /** lobehub Input parity: 'error' marks the field invalid. */
  status?: 'error' | 'warning';
  /** lobehub Input parity: 'filled' renders the secondary-surface variant. */
  variant?: 'borderless' | 'filled' | 'outlined';
}

const FormInput = memo<FormInputProps>(
  ({ onChange, status, variant, value: defaultValue, ...props }) => {
    const ref = useRef<HTMLInputElement>(null);
    const { compositionProps, isComposingRef } = useIMECompositionEvent();

    const [value, setValue] = useState(defaultValue as string);

    useEffect(() => {
      setValue(defaultValue as string);
    }, [defaultValue]);

    return (
      <Input
        aria-invalid={status === 'error' || undefined}
        className={variant === 'filled' ? 'bg-secondary border-transparent' : undefined}
        ref={ref}
        onBlur={() => {
          onChange?.(value);
        }}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        {...compositionProps}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isComposingRef.current) onChange?.(value);
          props.onKeyDown?.(e);
        }}
        {...props}
        value={value}
      />
    );
  },
);

FormInput.displayName = 'FormInput';

export default FormInput;

import { type InputHTMLAttributes } from 'react';
import { memo, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (value: string) => void;
}

const FormInput = memo<FormInputProps>(({ onChange, value: defaultValue, ...props }) => {
  const ref = useRef<HTMLInputElement>(null);
  const { compositionProps, isComposingRef } = useIMECompositionEvent();

  const [value, setValue] = useState(defaultValue as string);

  useEffect(() => {
    setValue(defaultValue as string);
  }, [defaultValue]);

  return (
    <Input
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
      }}
      {...props}
      value={value}
    />
  );
});

FormInput.displayName = 'FormInput';

export default FormInput;

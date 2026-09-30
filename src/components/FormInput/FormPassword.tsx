import { type InputHTMLAttributes } from 'react';
import { memo, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';

interface FormPasswordProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (value: string) => void;
}

const FormPassword = memo<FormPasswordProps>(({ onChange, value: defaultValue, ...props }) => {
  const ref = useRef<HTMLInputElement>(null);
  const { compositionProps, isComposingRef } = useIMECompositionEvent();

  const [value, setValue] = useState(defaultValue as string);

  useEffect(() => {
    setValue(defaultValue as string);
  }, [defaultValue]);

  return (
    <Input
      ref={ref}
      type={'password'}
      onBlur={() => {
        onChange?.(value);
      }}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      {...compositionProps}
      // Secret field (API keys, tokens): suppress autofill of the saved login
      // password. Overridable by callers via {...props}.
      autoComplete="new-password"
      {...props}
      value={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isComposingRef.current) onChange?.(value);
      }}
    />
  );
});

FormPassword.displayName = 'FormPassword';

export default FormPassword;

import { Eye, EyeOff } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';

interface FormPasswordProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'type'> {
  onChange?: (value: string) => void;
  /** lobehub Input parity: 'error' marks the field invalid. */
  status?: 'error' | 'warning';
}

const FormPassword = memo<FormPasswordProps>(
  ({ onChange, status, value: defaultValue, ...props }) => {
    const ref = useRef<HTMLInputElement>(null);
    const { compositionProps, isComposingRef } = useIMECompositionEvent();
    const [visible, setVisible] = useState(false);

    const [value, setValue] = useState(defaultValue as string);

    useEffect(() => {
      setValue(defaultValue as string);
    }, [defaultValue]);

    return (
      <div className="relative">
        <Input
          aria-invalid={status === 'error' || undefined}
          autoComplete="new-password"
          className="pr-8"
          ref={ref}
          type={visible ? 'text' : 'password'}
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
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          type="button"
          onClick={() => setVisible((prev) => !prev)}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  },
);

FormPassword.displayName = 'FormPassword';

export default FormPassword;

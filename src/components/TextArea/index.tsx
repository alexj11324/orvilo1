import { type TextareaHTMLAttributes } from 'react';
import { memo, useRef, useState } from 'react';

import { Textarea } from '@/components/ui/textarea';
import { useIMECompositionEvent } from '@/hooks/useIMECompositionEvent';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  onChange?: (value: string) => void;
}

const TextArea = memo<TextAreaProps>(({ onChange, value: defaultValue, ...props }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { compositionProps, isComposingRef } = useIMECompositionEvent();

  const [value, setValue] = useState(defaultValue as string);

  return (
    <Textarea
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

TextArea.displayName = 'TextArea';

export default TextArea;

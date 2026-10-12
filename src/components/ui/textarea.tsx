'use client';

import { cn } from 'cn';
import * as React from 'react';

import { useFormControlContext } from '@/components/FormControlContext';

import type { InputVisualSize } from './input';

interface TextareaProps extends React.ComponentProps<'textarea'> {
  /** Typography role; rows, content sizing and the multiline minimum height remain independent. */
  visualSize?: InputVisualSize;
}

function Textarea({ className, disabled, visualSize, ...props }: TextareaProps) {
  const formControl = useFormControlContext();
  const size =
    visualSize ??
    (formControl.size === 'small' ? 'small' : formControl.size === 'large' ? 'large' : 'default');

  return (
    <textarea
      data-slot="textarea"
      disabled={disabled ?? formControl.disabled}
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-(--radius-input) border border-input bg-transparent px-2.5 py-2 text-sm leading-5.5 transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        size === 'large' && 'text-base leading-6',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
export type { TextareaProps };

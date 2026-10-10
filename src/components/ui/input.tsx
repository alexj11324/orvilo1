import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from 'cn';
import * as React from 'react';

type InputVisualSize = 'default' | 'compact' | 'small' | 'normal' | 'large';

const inputVisualSizeClasses: Record<InputVisualSize, string> = {
  default: 'h-9',
  compact: 'h-8',
  small: 'h-7',
  normal: 'h-9',
  large: 'h-10 text-base',
};

interface InputProps extends React.ComponentProps<'input'> {
  /** Visual height; native `size` remains the input's character-width hint. */
  visualSize?: InputVisualSize;
}

function Input({ className, type, visualSize = 'default', ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      type={type}
      className={cn(
        'w-full min-w-0 rounded-(--radius-input) border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        inputVisualSizeClasses[visualSize],
        className,
      )}
      {...props}
    />
  );
}

export { Input, inputVisualSizeClasses };
export type { InputProps, InputVisualSize };

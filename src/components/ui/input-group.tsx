'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import * as React from 'react';

import { useFormControlContext } from '@/components/FormControlContext';
import { Button } from '@/components/ui/button';
import { Input, type InputVisualSize, inputVisualSizeClasses } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const InputGroupSizeContext = React.createContext<InputVisualSize | undefined>(undefined);

function InputGroup({
  className,
  visualSize,
  ...props
}: React.ComponentProps<'div'> & { visualSize?: InputVisualSize }) {
  const formControl = useFormControlContext();
  const size =
    visualSize ??
    (formControl.size === 'small' ? 'small' : formControl.size === 'large' ? 'large' : 'default');

  return (
    <InputGroupSizeContext value={size}>
      <div
        data-slot="input-group"
        role="group"
        className={cn(
          'group/input-group relative flex w-full min-w-0 items-center rounded-(--radius-input) border border-input transition-colors outline-none in-data-[slot=combobox-content]:focus-within:border-inherit in-data-[slot=combobox-content]:focus-within:ring-0 has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-3 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto dark:bg-input/30 dark:has-disabled:bg-input/80 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 has-[>[data-align=block-end]]:[&>input]:pbs-3 has-[>[data-align=block-start]]:[&>input]:pbe-3 has-[>[data-align=inline-end]]:[&>input]:pe-1.5 has-[>[data-align=inline-start]]:[&>input]:ps-1.5',
          inputVisualSizeClasses[size],
          className,
        )}
        {...props}
      />
    </InputGroupSizeContext>
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-(--radius-chip) [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        'inline-start': 'order-first ps-2 has-[>button]:ms-[-0.3rem] has-[>kbd]:ms-[-0.15rem]',
        'inline-end': 'order-last pe-2 has-[>button]:me-[-0.3rem] has-[>kbd]:me-[-0.15rem]',
        'block-start':
          'order-first w-full justify-start px-2.5 pbs-2 group-has-[>input]/input-group:pbs-2 [.border-b]:pbe-2',
        'block-end':
          'order-last w-full justify-start px-2.5 pbe-2 group-has-[>input]/input-group:pbe-2 [.border-t]:pbs-2',
      },
    },
    defaultVariants: {
      align: 'inline-start',
    },
  },
);

function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      role="group"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva('flex items-center gap-2 text-sm shadow-none', {
  variants: {
    size: {
      'xs': "gap-1 rounded-(--radius-input) px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
      'sm': '',
      'icon-xs':
        "rounded-(--radius-input) p-0 has-[>svg]:p-0 [&>svg:not([class*='size-'])]:size-3.5",
      'icon-sm': 'p-0 has-[>svg]:p-0',
    },
  },
  defaultVariants: {
    size: 'xs',
  },
});

function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  size = 'xs',
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: 'button' | 'submit' | 'reset';
  }) {
  return (
    <Button
      className={cn(inputGroupButtonVariants({ size }), className)}
      data-size={size}
      size={size === 'sm' ? 'compact' : size === 'icon-sm' ? 'icon' : (size ?? undefined)}
      type={type}
      variant={variant}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({ className, visualSize, ...props }: React.ComponentProps<typeof Input>) {
  const groupSize = React.use(InputGroupSizeContext);
  return (
    <Input
      data-slot="input-group-control"
      visualSize={visualSize ?? groupSize}
      className={cn(
        'flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  visualSize,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  const groupSize = React.use(InputGroupSizeContext);

  return (
    <Textarea
      data-slot="input-group-control"
      visualSize={visualSize ?? groupSize}
      className={cn(
        'flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
